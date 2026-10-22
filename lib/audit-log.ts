import "server-only";

import { randomUUID } from "node:crypto";
import { desc } from "drizzle-orm";
import { database } from "@/lib/database";
import { auditEvents } from "@/lib/schema";

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

// Audit logging records what already happened, usually after the controller
// accepted a physical action, so a logging failure is reported but never thrown.
export function recordAuditEvent(input: Omit<AuditEvent, "id" | "occurredAt"> & { details?: Record<string, string | null> }) {
  try {
    insertAuditEvent(input);
  } catch (error) {
    console.error("Gatey could not record an audit event", { action: input.action, outcome: input.outcome, error });
  }
}

function insertAuditEvent(input: Omit<AuditEvent, "id" | "occurredAt"> & { details?: Record<string, string | null> }) {
  database.insert(auditEvents).values({
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    actorUserId: input.actorUserId,
    actorName: input.actorName.slice(0, 160),
    householdId: input.householdId,
    householdName: input.householdName?.slice(0, 160) ?? null,
    action: input.action,
    outcome: input.outcome,
    details: input.details ?? {},
  }).run();
}

export function listAuditEvents(limit = 200): AuditEvent[] {
  const safeLimit = Math.max(1, Math.min(limit, 500));
  return database.select().from(auditEvents).orderBy(desc(auditEvents.occurredAt)).limit(safeLimit).all();
}
