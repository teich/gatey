import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { recordAuditEvent } from "@/lib/audit-log";
import { findAuthorizedPhoneCaller, type AuthorizedPhoneCaller } from "@/lib/phone-access";
import { startPhoneHold } from "@/lib/party-mode";
import { beginTwilioAction, finishTwilioAction, recordTwilioEvent, recoverPendingTwilioActions, type TwilioAction } from "@/lib/twilio-activity";
import { unlockGate } from "@/lib/unifi-access";

const HOLD_OPEN_MINUTES = 30;
const MAX_BODY_BYTES = 16_384;
const globalForTwilio = globalThis as unknown as { gateyTwilioRecovered?: boolean };

if (!globalForTwilio.gateyTwilioRecovered) {
  recoverPendingTwilioActions();
  globalForTwilio.gateyTwilioRecovered = true;
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function voice() {
  return process.env.TWILIO_TTS_VOICE || "Polly.Joanna-Neural";
}

function twimlSay(message: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="${escapeXml(voice())}">${escapeXml(message)}</Say><Hangup/></Response>`;
}

function twimlGather(message: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="dtmf" numDigits="1" action="/twilio/voice/confirm" method="POST" timeout="5"><Say voice="${escapeXml(voice())}">${escapeXml(message)}</Say></Gather><Say voice="${escapeXml(voice())}">No input received. Goodbye.</Say><Hangup/></Response>`;
}

function xml(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function publicRequestUrl(pathname: string) {
  const base = (process.env.TWILIO_PUBLIC_BASE_URL || process.env.BETTER_AUTH_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("TWILIO_PUBLIC_BASE_URL is not configured.");
  return `${base}${pathname}`;
}

function validSignature(signature: string, url: string, params: URLSearchParams, authToken: string) {
  let payload = url;
  const keys = [...new Set(params.keys())].sort();
  for (const key of keys) for (const value of params.getAll(key)) payload += key + value;
  const expected = Buffer.from(createHmac("sha1", authToken).update(payload).digest("base64"));
  const actual = Buffer.from(signature.trim());
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function readSignedForm(request: Request, pathname: string): Promise<URLSearchParams | Response> {
  if (process.env.GATEY_TWILIO_ENABLED?.toLowerCase() !== "true") return new Response("not found", { status: 404 });
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return new Response("unavailable", { status: 503 });
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") return new Response("unsupported media type", { status: 415 });
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (!Number.isFinite(declaredLength) || declaredLength < 0) return new Response("invalid content length", { status: 400 });
  if (declaredLength > MAX_BODY_BYTES) return new Response("request too large", { status: 413 });
  const body = await request.text();
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) return new Response("request too large", { status: 413 });
  const params = new URLSearchParams(body);
  let url: string;
  try { url = publicRequestUrl(pathname); } catch { return new Response("unavailable", { status: 503 }); }
  if (!validSignature(request.headers.get("x-twilio-signature") || "", url, params, authToken)) {
    recordTwilioEvent({ event: "signature_invalid", detail: pathname });
    return new Response("forbidden", { status: 403 });
  }
  return params;
}

function callerPrompt(caller: AuthorizedPhoneCaller) {
  const choices = [];
  if (caller.canOpen) choices.push("Press 1 now to open the gate.");
  if (caller.canHoldOpen) choices.push(`Press 2 to hold the gate open for ${HOLD_OPEN_MINUTES} minutes.`);
  return choices.join(" ") || "No gate actions are available for this number.";
}

function actionMessage(action: TwilioAction, status: string) {
  if (status === "succeeded") return action === "open" ? "The gate is now open." : `The gate will remain open for ${HOLD_OPEN_MINUTES} minutes.`;
  if (status === "pending") return "This gate request is already being processed.";
  if (status === "unknown") return "The previous gate request has an unknown result. Please check the gate before trying again.";
  return action === "open" ? "Unable to open the gate right now. Please try again." : "Unable to hold the gate open right now. Please try again.";
}

export async function handleTwilioVoice(request: Request) {
  const form = await readSignedForm(request, "/twilio/voice");
  if (form instanceof Response) return form;
  const from = form.get("From") || "";
  const callSid = (form.get("CallSid") || "").trim();
  const caller = findAuthorizedPhoneCaller(from);
  if (!caller) {
    recordTwilioEvent({ event: "caller_blocked", callerE164: from, callSid });
    return xml(twimlSay("This incoming number is not authorized for this gate."));
  }
  recordTwilioEvent({ event: "caller_prompted", callerE164: caller.phoneE164, callSid, actorUserId: caller.userId, householdId: caller.householdId });
  return xml(twimlGather(callerPrompt(caller)));
}

export async function handleTwilioVoiceConfirmation(request: Request) {
  const form = await readSignedForm(request, "/twilio/voice/confirm");
  if (form instanceof Response) return form;
  const from = form.get("From") || "";
  const callSid = (form.get("CallSid") || "").trim();
  const caller = findAuthorizedPhoneCaller(from);
  if (!caller) {
    recordTwilioEvent({ event: "caller_blocked", callerE164: from, callSid });
    return xml(twimlSay("This incoming number is not authorized for this gate."));
  }

  const digit = (form.get("Digits") || "").trim();
  const action: TwilioAction | undefined = digit === "1" ? "open" : digit === "2" ? "hold_open" : undefined;
  if (!action) {
    recordTwilioEvent({ event: "invalid_digit", detail: digit || "empty", callerE164: caller.phoneE164, callSid, actorUserId: caller.userId, householdId: caller.householdId });
    return xml(twimlSay("Invalid selection. Goodbye."));
  }
  if ((action === "open" && !caller.canOpen) || (action === "hold_open" && !caller.canHoldOpen)) {
    recordTwilioEvent({ event: "action_unauthorized", detail: action, callerE164: caller.phoneE164, callSid, actorUserId: caller.userId, householdId: caller.householdId });
    return xml(twimlSay("This number is not authorized for that action."));
  }

  let reservation;
  try {
    reservation = beginTwilioAction({ callSid, action, callerE164: caller.phoneE164, actorUserId: caller.userId, actorName: caller.userName, householdId: caller.householdId, householdName: caller.householdName });
  } catch (error) {
    return xml(twimlSay(error instanceof Error ? actionMessage(action, "failed") : "Unable to process this request."));
  }
  if (!reservation.created) return xml(twimlSay(actionMessage(action, reservation.attempt.status)));

  try {
    let detail = "";
    let successMessage = actionMessage(action, "succeeded");
    if (action === "open") {
      const status = await unlockGate({ id: caller.userId, name: caller.userName, source: "twilio-voice", extra: { from: caller.phoneE164, call_sid: callSid, digit } });
      detail = status.state;
    } else {
      const result = await startPhoneHold({ endsAt: new Date(Date.now() + HOLD_OPEN_MINUTES * 60_000), householdId: caller.householdId, householdName: caller.householdName, actorUserId: caller.userId, actorName: caller.userName });
      detail = result.alreadyActive ? "already active" : result.party.endsAt;
      if (result.alreadyActive) successMessage = "The gate is already held open.";
    }
    finishTwilioAction(callSid, action, "succeeded", detail);
    recordTwilioEvent({ event: action === "open" ? "unlock_success" : "hold_open", detail, callerE164: caller.phoneE164, callSid, actorUserId: caller.userId, householdId: caller.householdId });
    try { recordAuditEvent({ actorUserId: caller.userId, actorName: caller.userName, householdId: caller.householdId, householdName: caller.householdName, action: action === "open" ? "gate.open" : "party.enabled", outcome: "succeeded", details: { source: "twilio", callSid, phone: caller.phoneE164, result: detail } }); } catch { /* The physical action is authoritative. */ }
    return xml(twimlSay(successMessage));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Gate action failed.";
    finishTwilioAction(callSid, action, "failed", detail);
    recordTwilioEvent({ event: action === "open" ? "unlock_failed" : "action_failed", detail, callerE164: caller.phoneE164, callSid, actorUserId: caller.userId, householdId: caller.householdId });
    try { recordAuditEvent({ actorUserId: caller.userId, actorName: caller.userName, householdId: caller.householdId, householdName: caller.householdName, action: action === "open" ? "gate.open" : "party.enabled", outcome: "failed", details: { source: "twilio", callSid, phone: caller.phoneE164 } }); } catch { /* Keep the controller outcome. */ }
    return xml(twimlSay(actionMessage(action, "failed")));
  }
}
