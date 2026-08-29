import "server-only";

import { eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit-log";
import { database } from "@/lib/database";
import { partyMode } from "@/lib/schema";
import { endGateHoldOpen, holdGateOpenUntil } from "@/lib/unifi-access";

type PartyState = "scheduled" | "starting" | "active" | "failed" | "ended" | "cancelled";

type PartyRow = typeof partyMode.$inferSelect;

export type PartyMode = {
  state: "scheduled" | "active";
  startsAt: string;
  endsAt: string;
  householdId: string;
  householdName: string;
};

export class PartyModeConflictError extends Error {}

export class PartyModeValidationError extends Error {}

const globalForPartyMode = globalThis as unknown as {
  gateyPartyTimer?: ReturnType<typeof setTimeout>;
};

function currentRow(): PartyRow | undefined {
  return database.select().from(partyMode).where(eq(partyMode.id, 1)).get();
}

function asPartyMode(row: PartyRow | undefined): PartyMode | null {
  if (!row || (row.state !== "scheduled" && row.state !== "active")) return null;
  return {
    state: row.state,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    householdId: row.householdId,
    householdName: row.householdName,
  };
}

function updatePartyState(state: PartyState) {
  database.update(partyMode).set({ state, updatedAt: new Date().toISOString() }).where(eq(partyMode.id, 1)).run();
}

function isToday(date: Date, now: Date) {
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function armPartyTimer(row = currentRow()) {
  if (globalForPartyMode.gateyPartyTimer) clearTimeout(globalForPartyMode.gateyPartyTimer);
  if (!row || !["scheduled", "active"].includes(row.state)) return;

  const target = row.state === "scheduled" ? new Date(row.startsAt).getTime() : new Date(row.endsAt).getTime();
  const delay = Math.max(0, Math.min(target - Date.now(), 2_147_000_000));
  globalForPartyMode.gateyPartyTimer = setTimeout(() => void reconcilePartyMode(), delay);
}

async function startDuePartyMode(row: PartyRow) {
  const claimed = database.transaction(() => {
    const current = currentRow();
    if (!current || current.state !== "scheduled" || current.updatedAt !== row.updatedAt) {
      return false;
    }
    updatePartyState("starting");
    return true;
  }, { behavior: "immediate" });
  if (!claimed) return;

  try {
    await holdGateOpenUntil(new Date(row.endsAt));
    updatePartyState("active");
    try {
      recordAuditEvent({
        actorUserId: row.actorUserId,
        actorName: row.actorName,
        householdId: row.householdId,
        householdName: row.householdName,
        action: "party.started",
        outcome: "succeeded",
        details: { startsAt: row.startsAt, endsAt: row.endsAt, source: "scheduler" },
      });
    } catch { /* The controller already accepted the hold; keep its true state. */ }
  } catch {
    updatePartyState("failed");
    try {
      recordAuditEvent({
        actorUserId: row.actorUserId,
        actorName: row.actorName,
        householdId: row.householdId,
        householdName: row.householdName,
        action: "party.started",
        outcome: "failed",
        details: { startsAt: row.startsAt, endsAt: row.endsAt, source: "scheduler" },
      });
    } catch { /* Preserve the failed controller result if local logging is unavailable. */ }
  }
}

export async function reconcilePartyMode(): Promise<PartyMode | null> {
  let row = currentRow();
  if (!row) return null;
  const now = Date.now();
  const startsAt = new Date(row.startsAt).getTime();
  const endsAt = new Date(row.endsAt).getTime();

  if (endsAt <= now && ["scheduled", "starting", "active"].includes(row.state)) {
    updatePartyState("ended");
    if (row.state === "active") {
      try {
        recordAuditEvent({
          actorUserId: row.actorUserId,
          actorName: row.actorName,
          householdId: row.householdId,
          householdName: row.householdName,
          action: "party.ended",
          outcome: "succeeded",
          details: { endsAt: row.endsAt, source: "controller schedule" },
        });
      } catch { /* The controller's automatic close remains authoritative. */ }
    }
    row = currentRow();
  } else if (row.state === "scheduled" && startsAt <= now) {
    await startDuePartyMode(row);
    row = currentRow();
  }

  armPartyTimer(row);
  return asPartyMode(row);
}

export async function getPartyMode() {
  return reconcilePartyMode();
}

export async function schedulePartyMode(input: {
  startsAt: Date;
  endsAt: Date;
  householdId: string;
  householdName: string;
  actorUserId: string;
  actorName: string;
}) {
  const now = new Date();
  if (!isToday(input.startsAt, now) || !isToday(input.endsAt, now)) throw new PartyModeValidationError("Party mode can only be scheduled for today.");
  if (input.startsAt.getTime() < now.getTime() - 30_000) throw new PartyModeValidationError("Choose a start time that has not passed.");
  if (input.endsAt <= input.startsAt) throw new PartyModeValidationError("The closing time must be after the starting time.");

  database.transaction((tx) => {
    const existing = currentRow();
    if (existing && ["scheduled", "starting", "active"].includes(existing.state) && new Date(existing.endsAt) > now) {
      throw new PartyModeConflictError(`Party mode is already planned by ${existing.householdName} until ${new Date(existing.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`);
    }
    const timestamp = now.toISOString();
    const values = { id: 1, state: "scheduled" as const, startsAt: input.startsAt.toISOString(), endsAt: input.endsAt.toISOString(), householdId: input.householdId, householdName: input.householdName, actorUserId: input.actorUserId, actorName: input.actorName.slice(0, 160), createdAt: timestamp, updatedAt: timestamp };
    tx.insert(partyMode).values(values).onConflictDoUpdate({ target: partyMode.id, set: values }).run();
  }, { behavior: "immediate" });

  const party = await reconcilePartyMode();
  if (!party && input.startsAt <= now) throw new Error("UniFi could not hold the gate open until that time. Try an earlier closing time.");
  return party;
}

export async function startPhoneHold(input: {
  endsAt: Date;
  householdId: string;
  householdName: string;
  actorUserId: string;
  actorName: string;
}): Promise<{ party: PartyMode; alreadyActive: boolean }> {
  const now = new Date();
  if (input.endsAt <= now) throw new PartyModeValidationError("The phone hold must end in the future.");

  const existing = await reconcilePartyMode();
  if (existing) {
    if (existing.state === "active") return { party: existing, alreadyActive: true };
    throw new PartyModeConflictError(`${existing.householdName} already scheduled party mode.`);
  }
  const unresolved = currentRow();
  if (unresolved && unresolved.state === "starting") {
    throw new PartyModeConflictError("Another gate hold is already being processed.");
  }

  const timestamp = now.toISOString();
  const values = { id: 1, state: "starting" as const, startsAt: timestamp, endsAt: input.endsAt.toISOString(), householdId: input.householdId, householdName: input.householdName, actorUserId: input.actorUserId, actorName: input.actorName.slice(0, 160), createdAt: timestamp, updatedAt: timestamp };
  database.insert(partyMode).values(values).onConflictDoUpdate({ target: partyMode.id, set: values }).run();

  try {
    await holdGateOpenUntil(input.endsAt);
    updatePartyState("active");
    armPartyTimer(currentRow());
    const party = asPartyMode(currentRow());
    if (!party) throw new Error("Gatey did not retain the phone hold.");
    return { party, alreadyActive: false };
  } catch (error) {
    updatePartyState("failed");
    throw error;
  }
}

export async function endPartyMode(input: { householdId: string; isSystemAdmin: boolean }) {
  const party = await reconcilePartyMode();
  if (!party) throw new PartyModeValidationError("There is no current party mode to end.");
  if (!input.isSystemAdmin && party.householdId !== input.householdId) {
    throw new PartyModeConflictError(`${party.householdName} set this party mode, so only their household can end it.`);
  }

  const row = currentRow();
  if (!row) throw new PartyModeValidationError("There is no current party mode to end.");
  if (row.state === "scheduled") {
    updatePartyState("cancelled");
    armPartyTimer();
    return party;
  }

  updatePartyState("starting");
  try {
    await endGateHoldOpen();
    updatePartyState("cancelled");
    armPartyTimer();
    return party;
  } catch (error) {
    updatePartyState("active");
    armPartyTimer();
    throw error;
  }
}
