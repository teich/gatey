import "server-only";

import { randomUUID } from "node:crypto";
import { database } from "@/lib/database";

export type AuditEvent = {
  id: string;
  occurredAt: string;
  actorUserId: string;
  actorName: string;
  householdId: string | null;
  householdName: string | null;
  action: string;
  outcome: "succeeded" | "failed";
  details: Record<string, string | null>;
};

type AuditEventRow = {
  id: string;
  occurred_at: string;
  actor_user_id: string;
  actor_name: string;
  household_id: string | null;
  household_name: string | null;
  action: string;
  outcome: "succeeded" | "failed";
  details_json: string;
};

function detailsFromJson(value: string): Record<string, string | null> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string | null] => typeof entry[1] === "string" || entry[1] === null));
  } catch {
    return {};
  }
}

function mapAuditEvent(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    householdId: row.household_id,
    householdName: row.household_name,
    action: row.action,
    outcome: row.outcome,
    details: detailsFromJson(row.details_json),
  };
}

export function recordAuditEvent(input: Omit<AuditEvent, "id" | "occurredAt"> & { details?: Record<string, string | null> }) {
  database.prepare(`
    INSERT INTO audit_events (id, occurred_at, actor_user_id, actor_name, household_id, household_name, action, outcome, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    new Date().toISOString(),
    input.actorUserId,
    input.actorName.slice(0, 160),
    input.householdId,
    input.householdName?.slice(0, 160) ?? null,
    input.action,
    input.outcome,
    JSON.stringify(input.details || {}),
  );
}

export function listAuditEvents(limit = 200): AuditEvent[] {
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const rows = database.prepare(`
    SELECT id, occurred_at, actor_user_id, actor_name, household_id, household_name, action, outcome, details_json
    FROM audit_events
    ORDER BY occurred_at DESC
    LIMIT ?
  `).all(safeLimit) as AuditEventRow[];
  return rows.map(mapAuditEvent);
}
