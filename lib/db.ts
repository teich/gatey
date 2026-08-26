import "server-only";

import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
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
db.exec(readFileSync(join(process.cwd(), "db", "migrations", "001_initial.sql"), "utf8"));
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

export function markRevoked(id: string) {
  db.prepare("UPDATE credentials SET state = 'revoked', revoked_at = ? WHERE id = ? AND household_id = 'oren-home'").run(new Date().toISOString(), id);
}
