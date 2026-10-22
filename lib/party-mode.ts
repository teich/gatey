import "server-only";

import { eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit-log";
import { database } from "@/lib/database";
import { formatGateyDateTime, gateyDateKey } from "@/lib/date-time";
import { partyMode } from "@/lib/schema";
import { endGateHoldOpen, holdGateOpenUntil } from "@/lib/unifi-access";

// "starting" and "ending" mark a controller request in flight. If one outlives
// RECOVERY_DELAY_MS (the process restarted mid-request), reconciliation repeats
// that same request, so an interrupted end can never re-open the gate.
type PartyState = "scheduled" | "starting" | "active" | "ending" | "failed" | "ended" | "cancelled";

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
const RECOVERY_DELAY_MS = 30_000;
const LIVE_STATES: PartyState[] = ["scheduled", "starting", "active", "ending"];

function currentRow(): PartyRow | undefined {
  return database.select().from(partyMode).where(eq(partyMode.id, 1)).get();
}

function asPartyMode(row: PartyRow | undefined, now = Date.now()): PartyMode | null {
  if (!row || new Date(row.endsAt).getTime() <= now) return null;
  // The gate stays held while an end request is in flight.
  const state =
    row.state === "scheduled" ? "scheduled" : row.state === "active" || row.state === "ending" ? "active" : null;
  if (!state) return null;
  return {
    state,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    householdId: row.householdId,
    householdName: row.householdName,
  };
}

function updatePartyState(state: PartyState) {
  database.update(partyMode).set({ state, updatedAt: new Date().toISOString() }).where(eq(partyMode.id, 1)).run();
}

// Moves the row from `from` to `to` only if nobody changed it since `row` was
// read, so concurrent reconciliations act on a transition exactly once.
function claimTransition(row: PartyRow, from: PartyState, to: PartyState, options: { stale?: boolean } = {}) {
  return database.transaction(
    () => {
      const current = currentRow();
      if (!current || current.state !== from || current.updatedAt !== row.updatedAt) return false;
      if (options.stale && Date.now() - new Date(current.updatedAt).getTime() < RECOVERY_DELAY_MS) return false;
      updatePartyState(to);
      return true;
    },
    { behavior: "immediate" },
  );
}

function auditParty(row: PartyRow, action: string, outcome: "succeeded" | "failed", details: Record<string, string>) {
  recordAuditEvent({
    actorUserId: row.actorUserId,
    actorName: row.actorName,
    householdId: row.householdId,
    householdName: row.householdName,
    action,
    outcome,
    details,
  });
}

function isToday(date: Date, now: Date) {
  return gateyDateKey(date) === gateyDateKey(now);
}

function armPartyTimer(row = currentRow()) {
  if (globalForPartyMode.gateyPartyTimer) clearTimeout(globalForPartyMode.gateyPartyTimer);
  if (!row || !LIVE_STATES.includes(row.state)) return;

  const target =
    row.state === "scheduled"
      ? new Date(row.startsAt).getTime()
      : row.state === "active"
        ? new Date(row.endsAt).getTime()
        : new Date(row.updatedAt).getTime() + RECOVERY_DELAY_MS;
  const delay = Math.max(0, Math.min(target - Date.now(), 2_147_000_000));
  globalForPartyMode.gateyPartyTimer = setTimeout(
    () =>
      void reconcilePartyMode().catch((error) => {
        console.error("Party-mode reconciliation failed", error);
      }),
    delay,
  );
}

// Call only after claiming the "starting" state.
async function applyHold(row: PartyRow, source: string) {
  const details = { startsAt: row.startsAt, endsAt: row.endsAt, source };
  try {
    await holdGateOpenUntil(new Date(row.endsAt));
    updatePartyState("active");
    auditParty(row, "party.started", "succeeded", details);
  } catch {
    updatePartyState("failed");
    auditParty(row, "party.started", "failed", details);
  }
}

// Call only after claiming the "ending" state. A failure leaves the hold active.
async function releaseHold() {
  try {
    await endGateHoldOpen();
    updatePartyState("cancelled");
  } catch (error) {
    updatePartyState("active");
    throw error;
  }
}

export async function reconcilePartyMode(): Promise<PartyMode | null> {
  let row = currentRow();
  if (!row) return null;
  const now = Date.now();
  const startsAt = new Date(row.startsAt).getTime();
  const endsAt = new Date(row.endsAt).getTime();

  if (endsAt <= now && LIVE_STATES.includes(row.state)) {
    updatePartyState("ended");
    if (row.state === "active" || row.state === "ending") {
      auditParty(row, "party.ended", "succeeded", { endsAt: row.endsAt, source: "controller schedule" });
    }
  } else if (row.state === "scheduled" && startsAt <= now) {
    if (claimTransition(row, "scheduled", "starting")) await applyHold(row, "scheduler");
  } else if (row.state === "starting") {
    if (claimTransition(row, "starting", "starting", { stale: true })) await applyHold(row, "recovery");
  } else if (row.state === "ending") {
    if (claimTransition(row, "ending", "ending", { stale: true })) {
      try {
        await releaseHold();
        auditParty(row, "party.ended", "succeeded", { endsAt: row.endsAt, source: "recovery" });
      } catch {
        auditParty(row, "party.ended", "failed", { endsAt: row.endsAt, source: "recovery" });
      }
    }
  }

  row = currentRow();
  armPartyTimer(row);
  return asPartyMode(row);
}

// Read-only: the in-process timer, startup recovery and the systemd timer move
// the state machine, so viewing party mode never touches the controller.
export function getPartyMode(): PartyMode | null {
  return asPartyMode(currentRow());
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
  if (!isToday(input.startsAt, now) || !isToday(input.endsAt, now))
    throw new PartyModeValidationError("Party mode can only be scheduled for today.");
  if (input.startsAt.getTime() < now.getTime() - 30_000)
    throw new PartyModeValidationError("Choose a start time that has not passed.");
  if (input.endsAt <= input.startsAt)
    throw new PartyModeValidationError("The closing time must be after the starting time.");

  database.transaction(
    (tx) => {
      const existing = currentRow();
      if (existing && LIVE_STATES.includes(existing.state) && new Date(existing.endsAt) > now) {
        throw new PartyModeConflictError(
          `Party mode is already planned by ${existing.householdName} until ${formatGateyDateTime(existing.endsAt, { hour: "numeric", minute: "2-digit" })}.`,
        );
      }
      const timestamp = now.toISOString();
      const values = {
        id: 1,
        state: "scheduled" as const,
        startsAt: input.startsAt.toISOString(),
        endsAt: input.endsAt.toISOString(),
        householdId: input.householdId,
        householdName: input.householdName,
        actorUserId: input.actorUserId,
        actorName: input.actorName.slice(0, 160),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      tx.insert(partyMode).values(values).onConflictDoUpdate({ target: partyMode.id, set: values }).run();
    },
    { behavior: "immediate" },
  );

  const party = await reconcilePartyMode();
  if (!party && input.startsAt <= now)
    throw new Error("UniFi could not hold the gate open until that time. Try an earlier closing time.");
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
  const values = {
    id: 1,
    state: "starting" as const,
    startsAt: timestamp,
    endsAt: input.endsAt.toISOString(),
    householdId: input.householdId,
    householdName: input.householdName,
    actorUserId: input.actorUserId,
    actorName: input.actorName.slice(0, 160),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
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
    if (!claimTransition(row, "scheduled", "cancelled"))
      throw new PartyModeConflictError("Party mode changed while it was being cancelled. Try again.");
    armPartyTimer();
    return party;
  }
  if (!claimTransition(row, "active", "ending")) throw new PartyModeConflictError("Party mode is already being ended.");

  try {
    await releaseHold();
    return party;
  } finally {
    armPartyTimer();
  }
}
