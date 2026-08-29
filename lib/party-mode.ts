import "server-only";

import { recordAuditEvent } from "@/lib/audit-log";
import { database } from "@/lib/database";
import { endGateHoldOpen, holdGateOpenUntil } from "@/lib/unifi-access";

type PartyState = "scheduled" | "starting" | "active" | "failed" | "ended" | "cancelled";

type PartyRow = {
  id: 1;
  state: PartyState;
  starts_at: string;
  ends_at: string;
  household_id: string;
  household_name: string;
  actor_user_id: string;
  actor_name: string;
  created_at: string;
  updated_at: string;
};

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
  return database.prepare(`
    SELECT id, state, starts_at, ends_at, household_id, household_name, actor_user_id, actor_name, created_at, updated_at
    FROM party_mode
    WHERE id = 1
  `).get() as PartyRow | undefined;
}

function asPartyMode(row: PartyRow | undefined): PartyMode | null {
  if (!row || (row.state !== "scheduled" && row.state !== "active")) return null;
  return {
    state: row.state,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    householdId: row.household_id,
    householdName: row.household_name,
  };
}

function updatePartyState(state: PartyState) {
  database.prepare("UPDATE party_mode SET state = ?, updated_at = ? WHERE id = 1").run(state, new Date().toISOString());
}

function isToday(date: Date, now: Date) {
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function armPartyTimer(row = currentRow()) {
  if (globalForPartyMode.gateyPartyTimer) clearTimeout(globalForPartyMode.gateyPartyTimer);
  if (!row || !["scheduled", "active"].includes(row.state)) return;

  const target = row.state === "scheduled" ? new Date(row.starts_at).getTime() : new Date(row.ends_at).getTime();
  const delay = Math.max(0, Math.min(target - Date.now(), 2_147_000_000));
  globalForPartyMode.gateyPartyTimer = setTimeout(() => void reconcilePartyMode(), delay);
}

async function startDuePartyMode(row: PartyRow) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const current = currentRow();
    if (!current || current.state !== "scheduled" || current.updated_at !== row.updated_at) {
      database.exec("COMMIT");
      return;
    }
    updatePartyState("starting");
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  try {
    await holdGateOpenUntil(new Date(row.ends_at));
    updatePartyState("active");
    try {
      recordAuditEvent({
        actorUserId: row.actor_user_id,
        actorName: row.actor_name,
        householdId: row.household_id,
        householdName: row.household_name,
        action: "party.started",
        outcome: "succeeded",
        details: { startsAt: row.starts_at, endsAt: row.ends_at, source: "scheduler" },
      });
    } catch { /* The controller already accepted the hold; keep its true state. */ }
  } catch {
    updatePartyState("failed");
    try {
      recordAuditEvent({
        actorUserId: row.actor_user_id,
        actorName: row.actor_name,
        householdId: row.household_id,
        householdName: row.household_name,
        action: "party.started",
        outcome: "failed",
        details: { startsAt: row.starts_at, endsAt: row.ends_at, source: "scheduler" },
      });
    } catch { /* Preserve the failed controller result if local logging is unavailable. */ }
  }
}

export async function reconcilePartyMode(): Promise<PartyMode | null> {
  let row = currentRow();
  if (!row) return null;
  const now = Date.now();
  const startsAt = new Date(row.starts_at).getTime();
  const endsAt = new Date(row.ends_at).getTime();

  if (endsAt <= now && ["scheduled", "starting", "active"].includes(row.state)) {
    updatePartyState("ended");
    if (row.state === "active") {
      try {
        recordAuditEvent({
          actorUserId: row.actor_user_id,
          actorName: row.actor_name,
          householdId: row.household_id,
          householdName: row.household_name,
          action: "party.ended",
          outcome: "succeeded",
          details: { endsAt: row.ends_at, source: "controller schedule" },
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

  database.exec("BEGIN IMMEDIATE");
  try {
    const existing = currentRow();
    if (existing && ["scheduled", "starting", "active"].includes(existing.state) && new Date(existing.ends_at) > now) {
      throw new PartyModeConflictError(`Party mode is already planned by ${existing.household_name} until ${new Date(existing.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`);
    }
    const timestamp = now.toISOString();
    database.prepare(`
      INSERT INTO party_mode (id, state, starts_at, ends_at, household_id, household_name, actor_user_id, actor_name, created_at, updated_at)
      VALUES (1, 'scheduled', ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        state = excluded.state,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        household_id = excluded.household_id,
        household_name = excluded.household_name,
        actor_user_id = excluded.actor_user_id,
        actor_name = excluded.actor_name,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `).run(input.startsAt.toISOString(), input.endsAt.toISOString(), input.householdId, input.householdName, input.actorUserId, input.actorName.slice(0, 160), timestamp, timestamp);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

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
  database.prepare(`
    INSERT INTO party_mode (id, state, starts_at, ends_at, household_id, household_name, actor_user_id, actor_name, created_at, updated_at)
    VALUES (1, 'starting', ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      state = excluded.state,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      household_id = excluded.household_id,
      household_name = excluded.household_name,
      actor_user_id = excluded.actor_user_id,
      actor_name = excluded.actor_name,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `).run(timestamp, input.endsAt.toISOString(), input.householdId, input.householdName, input.actorUserId, input.actorName.slice(0, 160), timestamp, timestamp);

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
