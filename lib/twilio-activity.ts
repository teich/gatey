import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { database } from "@/lib/database";
import { organization, twilioActionAttempts, twilioEvents, user } from "@/lib/schema";

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

export function recordTwilioEvent(input: {
  event: string;
  detail?: string;
  callSid?: string;
  callerE164?: string;
  actorUserId?: string;
  householdId?: string;
}) {
  database.insert(twilioEvents).values({
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    callSid: input.callSid || "",
    callerE164: input.callerE164 || "",
    event: input.event,
    detail: input.detail || "",
    actorUserId: input.actorUserId || null,
    householdId: input.householdId || null,
  }).run();
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
  const result = database.insert(twilioActionAttempts).values({
    id,
    callSid: input.callSid,
    action: input.action,
    callerE164: input.callerE164,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    householdId: input.householdId,
    householdName: input.householdName,
    status: "pending",
    requestedAt: new Date().toISOString(),
  }).onConflictDoNothing().run();
  const row = database.select({
    callSid: twilioActionAttempts.callSid,
    action: twilioActionAttempts.action,
    status: twilioActionAttempts.status,
    detail: twilioActionAttempts.detail,
  }).from(twilioActionAttempts)
    .where(and(eq(twilioActionAttempts.callSid, input.callSid), eq(twilioActionAttempts.action, input.action))).get();
  if (!row) throw new Error("The Twilio action reservation could not be read.");
  return { attempt: row, created: Boolean(result.changes) };
}

export function finishTwilioAction(callSid: string, action: TwilioAction, status: Exclude<TwilioActionStatus, "pending">, detail = "") {
  database.update(twilioActionAttempts).set({ status, completedAt: new Date().toISOString(), detail: detail.slice(0, 500) })
    .where(and(eq(twilioActionAttempts.callSid, callSid), eq(twilioActionAttempts.action, action), eq(twilioActionAttempts.status, "pending"))).run();
}

export function recoverPendingTwilioActions(): number {
  return Number(database.update(twilioActionAttempts).set({
    status: "unknown",
    completedAt: new Date().toISOString(),
    detail: "Gatey restarted before the controller result was recorded.",
  }).where(eq(twilioActionAttempts.status, "pending")).run().changes);
}

export function listTwilioEvents(limit = 200): TwilioEvent[] {
  return database.select({
    id: twilioEvents.id,
    occurredAt: twilioEvents.occurredAt,
    callSid: twilioEvents.callSid,
    callerE164: twilioEvents.callerE164,
    event: twilioEvents.event,
    detail: twilioEvents.detail,
    actorName: user.name,
    householdName: organization.name,
  }).from(twilioEvents)
    .leftJoin(user, eq(user.id, twilioEvents.actorUserId))
    .leftJoin(organization, eq(organization.id, twilioEvents.householdId))
    .orderBy(desc(twilioEvents.occurredAt)).limit(Math.max(1, Math.min(limit, 500))).all();
}
