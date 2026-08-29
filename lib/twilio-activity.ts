import "server-only";

import { randomUUID } from "node:crypto";
import { database } from "@/lib/database";

export type TwilioAction = "open" | "hold_open";
export type TwilioActionStatus = "pending" | "succeeded" | "failed" | "unknown";

export type TwilioActionAttempt = {
  callSid: string;
  action: TwilioAction;
  status: TwilioActionStatus;
  detail: string;
};

export type TwilioEvent = {
  id: string;
  occurredAt: string;
  callSid: string;
  callerE164: string;
  event: string;
  detail: string;
  actorName: string | null;
  householdName: string | null;
};

type AttemptRow = {
  callSid: string;
  action: TwilioAction;
  status: TwilioActionStatus;
  detail: string;
};

export function recordTwilioEvent(input: {
  event: string;
  detail?: string;
  callSid?: string;
  callerE164?: string;
  actorUserId?: string;
  householdId?: string;
}) {
  database.prepare(`
    INSERT INTO twilio_events (id, occurred_at, call_sid, caller_e164, event, detail, actor_user_id, household_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), new Date().toISOString(), input.callSid || "", input.callerE164 || "", input.event, input.detail || "", input.actorUserId || null, input.householdId || null);
}

export function beginTwilioAction(input: {
  callSid: string;
  action: TwilioAction;
  callerE164: string;
  actorUserId: string;
  actorName: string;
  householdId: string;
  householdName: string;
}): { attempt: TwilioActionAttempt; created: boolean } {
  if (!input.callSid) throw new Error("Twilio did not provide a CallSid.");
  const id = randomUUID();
  const result = database.prepare(`
    INSERT OR IGNORE INTO twilio_action_attempts
      (id, call_sid, action, caller_e164, actor_user_id, actor_name, household_id, household_name, status, requested_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(id, input.callSid, input.action, input.callerE164, input.actorUserId, input.actorName, input.householdId, input.householdName, new Date().toISOString());
  const row = database.prepare(`
    SELECT call_sid AS callSid, action, status, detail
    FROM twilio_action_attempts WHERE call_sid = ? AND action = ?
  `).get(input.callSid, input.action) as AttemptRow | undefined;
  if (!row) throw new Error("The Twilio action reservation could not be read.");
  return { attempt: row, created: Boolean(result.changes) };
}

export function finishTwilioAction(callSid: string, action: TwilioAction, status: Exclude<TwilioActionStatus, "pending">, detail = "") {
  database.prepare(`
    UPDATE twilio_action_attempts
    SET status = ?, completed_at = ?, detail = ?
    WHERE call_sid = ? AND action = ? AND status = 'pending'
  `).run(status, new Date().toISOString(), detail.slice(0, 500), callSid, action);
}

export function recoverPendingTwilioActions(): number {
  return Number(database.prepare(`
    UPDATE twilio_action_attempts
    SET status = 'unknown', completed_at = ?, detail = 'Gatey restarted before the controller result was recorded.'
    WHERE status = 'pending'
  `).run(new Date().toISOString()).changes);
}

export function listTwilioEvents(limit = 200): TwilioEvent[] {
  return database.prepare(`
    SELECT
      twilio_events.id,
      twilio_events.occurred_at AS occurredAt,
      twilio_events.call_sid AS callSid,
      twilio_events.caller_e164 AS callerE164,
      twilio_events.event,
      twilio_events.detail,
      user.name AS actorName,
      organization.name AS householdName
    FROM twilio_events
    LEFT JOIN user ON user.id = twilio_events.actor_user_id
    LEFT JOIN organization ON organization.id = twilio_events.household_id
    ORDER BY twilio_events.occurred_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(limit, 500))) as TwilioEvent[];
}
