import "server-only";

import type { Credential, CredentialState } from "@/lib/credentials";
import { database } from "@/lib/database";

type CredentialRow = {
  id: string;
  label: string;
  pin: string;
  starts_at: string;
  ends_at: string;
  state: CredentialState;
  revoked_at: string | null;
};

function mapCredential(row: CredentialRow): Credential {
  const now = Date.now();
  const computedState: CredentialState = row.revoked_at
    ? "revoked"
    : new Date(row.starts_at).getTime() > now
      ? "upcoming"
      : new Date(row.ends_at).getTime() < now
        ? "expired"
        : row.state;
  return {
    id: row.id,
    label: row.label,
    pin: row.pin,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    state: computedState,
    ...(row.revoked_at ? { revokedAt: row.revoked_at } : {}),
  };
}

export function listCredentials(householdId: string): Credential[] {
  const rows = database.prepare(`
    SELECT id, label, pin, starts_at, ends_at, state, revoked_at
    FROM credentials
    WHERE household_id = ?
    ORDER BY starts_at DESC, created_at DESC
  `).all(householdId) as CredentialRow[];
  return rows.map(mapCredential);
}

export function insertCredential(householdId: string, credential: Credential, controllerVisitorId: string) {
  database.prepare(`
    INSERT INTO credentials (id, household_id, label, pin, starts_at, ends_at, controller_visitor_id, state, revoked_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    credential.id,
    householdId,
    credential.label,
    credential.pin,
    credential.startsAt,
    credential.endsAt,
    controllerVisitorId,
    credential.state,
    credential.revokedAt ?? null,
    new Date().toISOString(),
  );
}

export function getControllerVisitorId(householdId: string, id: string): string | undefined {
  const row = database.prepare("SELECT controller_visitor_id FROM credentials WHERE id = ? AND household_id = ?").get(id, householdId) as { controller_visitor_id?: string } | undefined;
  return row?.controller_visitor_id;
}

export function managedVisitorIds(): Set<string> {
  const rows = database.prepare("SELECT controller_visitor_id FROM credentials").all() as Array<{ controller_visitor_id: string }>;
  return new Set(rows.map((row) => row.controller_visitor_id));
}

export function managedVisitorPins(): Map<string, string> {
  const rows = database.prepare(`
    SELECT controller_visitor_id AS id, pin FROM credentials
    UNION ALL
    SELECT controller_visitor_id AS id, pin FROM visitor_pins
  `).all() as Array<{ id: string; pin: string }>;
  return new Map(rows.map((row) => [row.id, row.pin]));
}

export function saveVisitorPin(input: { householdId: string; visitorId: string; label: string; pin: string }) {
  const replacedAt = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      INSERT INTO visitor_pins (controller_visitor_id, household_id, label, pin, replaced_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(controller_visitor_id) DO UPDATE SET
        household_id = excluded.household_id,
        label = excluded.label,
        pin = excluded.pin,
        replaced_at = excluded.replaced_at
    `).run(input.visitorId, input.householdId, input.label, input.pin, replacedAt);
    database.prepare("UPDATE credentials SET pin = ? WHERE controller_visitor_id = ? AND household_id = ?").run(input.pin, input.visitorId, input.householdId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function managedPersonPins(): Map<string, string> {
  const rows = database.prepare("SELECT controller_user_id, pin FROM person_pins").all() as Array<{ controller_user_id: string; pin: string }>;
  return new Map(rows.map((row) => [row.controller_user_id, row.pin]));
}

export function savePersonPin(input: { householdId: string; userId: string; label: string; pin: string }) {
  database.prepare(`
    INSERT INTO person_pins (controller_user_id, household_id, label, pin, replaced_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(controller_user_id) DO UPDATE SET
      household_id = excluded.household_id,
      label = excluded.label,
      pin = excluded.pin,
      replaced_at = excluded.replaced_at
  `).run(input.userId, input.householdId, input.label, input.pin, new Date().toISOString());
}

export function markRevoked(householdId: string, id: string) {
  database.prepare("UPDATE credentials SET state = 'revoked', revoked_at = ? WHERE id = ? AND household_id = ?").run(new Date().toISOString(), id, householdId);
}
