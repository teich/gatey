import "server-only";

import Database from "better-sqlite3";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Credential, CredentialState } from "@/lib/credentials";

type CredentialRow = {
  id: string;
  label: string;
  pin: string;
  starts_at: string;
  ends_at: string;
  state: CredentialState;
  revoked_at: string | null;
};

const databasePath = process.env.GATEY_DB_PATH || join(process.cwd(), "data", "gatey.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

const globalForDb = globalThis as unknown as { gateyDb?: Database.Database };
const db = globalForDb.gateyDb ?? new Database(databasePath);
if (process.env.NODE_ENV !== "production") globalForDb.gateyDb = db;

db.pragma("journal_mode = WAL");
const migrationsDirectory = join(process.cwd(), "db", "migrations");
for (const migration of readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql")).sort()) {
  db.exec(readFileSync(join(migrationsDirectory, migration), "utf8"));
}
db.pragma("optimize");

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

export function listCredentials(): Credential[] {
  const rows = db.prepare(`
    SELECT id, label, pin, starts_at, ends_at, state, revoked_at
    FROM credentials
    WHERE household_id = 'oren-home'
    ORDER BY starts_at DESC, created_at DESC
  `).all() as CredentialRow[];
  return rows.map(mapCredential);
}

export function insertCredential(credential: Credential, controllerVisitorId: string) {
  db.prepare(`
    INSERT INTO credentials (id, label, pin, starts_at, ends_at, controller_visitor_id, state, revoked_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    credential.id,
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

export function getControllerVisitorId(id: string): string | undefined {
  const row = db.prepare("SELECT controller_visitor_id FROM credentials WHERE id = ? AND household_id = 'oren-home'").get(id) as { controller_visitor_id?: string } | undefined;
  return row?.controller_visitor_id;
}

export function managedVisitorIds(): Set<string> {
  const rows = db.prepare("SELECT controller_visitor_id FROM credentials WHERE household_id = 'oren-home'").all() as Array<{ controller_visitor_id: string }>;
  return new Set(rows.map((row) => row.controller_visitor_id));
}

export function managedPersonPins(): Map<string, string> {
  const rows = db.prepare("SELECT controller_user_id, pin FROM person_pins WHERE household_id = 'oren-home'").all() as Array<{ controller_user_id: string; pin: string }>;
  return new Map(rows.map((row) => [row.controller_user_id, row.pin]));
}

export function savePersonPin(input: { userId: string; label: string; pin: string }) {
  db.prepare(`
    INSERT INTO person_pins (controller_user_id, household_id, label, pin, replaced_at)
    VALUES (?, 'oren-home', ?, ?, ?)
    ON CONFLICT(controller_user_id) DO UPDATE SET
      label = excluded.label,
      pin = excluded.pin,
      replaced_at = excluded.replaced_at
  `).run(input.userId, input.label, input.pin, new Date().toISOString());
}

export function markRevoked(id: string) {
  db.prepare("UPDATE credentials SET state = 'revoked', revoked_at = ? WHERE id = ? AND household_id = 'oren-home'").run(new Date().toISOString(), id);
}
