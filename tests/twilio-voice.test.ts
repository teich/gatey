import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  findAuthorizedPhoneCaller: vi.fn(),
  startPhoneHold: vi.fn(),
  beginTwilioAction: vi.fn(),
  finishTwilioAction: vi.fn(),
  recordTwilioEvent: vi.fn(),
  recoverPendingTwilioActions: vi.fn(() => 0),
  unlockGate: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/phone-access", () => ({ findAuthorizedPhoneCaller: dependencies.findAuthorizedPhoneCaller }));
vi.mock("@/lib/party-mode", () => ({ startPhoneHold: dependencies.startPhoneHold }));
vi.mock("@/lib/twilio-activity", () => ({
  beginTwilioAction: dependencies.beginTwilioAction,
  finishTwilioAction: dependencies.finishTwilioAction,
  recordTwilioEvent: dependencies.recordTwilioEvent,
  recoverPendingTwilioActions: dependencies.recoverPendingTwilioActions,
}));
vi.mock("@/lib/unifi-access", () => ({ unlockGate: dependencies.unlockGate }));
vi.mock("@/lib/audit-log", () => ({ recordAuditEvent: dependencies.recordAuditEvent }));

import { handleTwilioVoice, handleTwilioVoiceConfirmation } from "@/lib/twilio-voice";

const AUTH_TOKEN = "test-auth-token";
const BASE_URL = "https://gatey.example";
const caller = {
  id: "phone-1",
  userId: "user-1",
  phoneE164: "+17075551111",
  label: "Mobile",
  notes: "",
  enabled: true,
  canOpen: true,
  canHoldOpen: true,
  userName: "Resident",
  householdId: "home-a",
  householdName: "Home A",
};

function signature(pathname: string, body: URLSearchParams) {
  let payload = `${BASE_URL}${pathname}`;
  for (const key of [...new Set(body.keys())].sort()) {
    for (const value of body.getAll(key)) payload += key + value;
  }
  return createHmac("sha1", AUTH_TOKEN).update(payload).digest("base64");
}

function signedRequest(pathname: string, values: Record<string, string>, signatureOverride?: string) {
  const body = new URLSearchParams(values);
  const encoded = body.toString();
  return new Request(`${BASE_URL}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "content-length": String(Buffer.byteLength(encoded)),
      "x-twilio-signature": signatureOverride ?? signature(pathname, body),
    },
    body: encoded,
  });
}

describe("Twilio voice webhook", () => {
  beforeEach(() => {
    process.env.GATEY_TWILIO_ENABLED = "true";
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    process.env.TWILIO_PUBLIC_BASE_URL = BASE_URL;
    delete process.env.TWILIO_TTS_VOICE;
    for (const mock of Object.values(dependencies)) mock.mockClear();
    dependencies.findAuthorizedPhoneCaller.mockReturnValue(caller);
    dependencies.beginTwilioAction.mockReturnValue({
      created: true,
      attempt: { callSid: "CA123", action: "open", status: "pending", detail: "" },
    });
    dependencies.unlockGate.mockResolvedValue({ state: "opening", position: "close", relay: "unlock" });
  });

  it("is unavailable when phone access is disabled", async () => {
    process.env.GATEY_TWILIO_ENABLED = "false";

    const response = await handleTwilioVoice(signedRequest("/twilio/voice", { From: caller.phoneE164, CallSid: "CA123" }));

    expect(response.status).toBe(404);
    expect(dependencies.findAuthorizedPhoneCaller).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature before looking up the caller", async () => {
    const response = await handleTwilioVoice(signedRequest(
      "/twilio/voice",
      { From: caller.phoneE164, CallSid: "CA123" },
      "invalid",
    ));

    expect(response.status).toBe(403);
    expect(dependencies.findAuthorizedPhoneCaller).not.toHaveBeenCalled();
    expect(dependencies.recordTwilioEvent).toHaveBeenCalledWith({ event: "signature_invalid", detail: "/twilio/voice" });
  });

  it("rejects oversized requests using the declared length", async () => {
    const request = signedRequest("/twilio/voice", { From: caller.phoneE164, CallSid: "CA123" });
    request.headers.set("content-length", "16385");

    const response = await handleTwilioVoice(request);

    expect(response.status).toBe(413);
  });

  it("returns safe TwiML containing only the caller's allowed choices", async () => {
    dependencies.findAuthorizedPhoneCaller.mockReturnValue({ ...caller, canHoldOpen: false });
    process.env.TWILIO_TTS_VOICE = 'Voice"><Break time="10s"/>';

    const response = await handleTwilioVoice(signedRequest("/twilio/voice", { From: caller.phoneE164, CallSid: "CA123" }));
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/xml");
    expect(body).toContain("Press 1 now to open the gate.");
    expect(body).not.toContain("Press 2");
    expect(body).toContain("&quot;");
    expect(body).not.toContain('<Break time="10s"/>');
  });

  it("rejects a validly signed action the caller is not allowed to perform", async () => {
    dependencies.findAuthorizedPhoneCaller.mockReturnValue({ ...caller, canHoldOpen: false });

    const response = await handleTwilioVoiceConfirmation(signedRequest("/twilio/voice/confirm", {
      From: caller.phoneE164,
      CallSid: "CA123",
      Digits: "2",
    }));

    expect(await response.text()).toContain("not authorized for that action");
    expect(dependencies.beginTwilioAction).not.toHaveBeenCalled();
    expect(dependencies.startPhoneHold).not.toHaveBeenCalled();
  });

  it("does not repeat a controller action for a retried CallSid", async () => {
    dependencies.beginTwilioAction.mockReturnValue({
      created: false,
      attempt: { callSid: "CA123", action: "open", status: "succeeded", detail: "opening" },
    });

    const response = await handleTwilioVoiceConfirmation(signedRequest("/twilio/voice/confirm", {
      From: caller.phoneE164,
      CallSid: "CA123",
      Digits: "1",
    }));

    expect(await response.text()).toContain("gate is now open");
    expect(dependencies.unlockGate).not.toHaveBeenCalled();
    expect(dependencies.finishTwilioAction).not.toHaveBeenCalled();
  });

  it("records one successful unlock for a new request", async () => {
    const response = await handleTwilioVoiceConfirmation(signedRequest("/twilio/voice/confirm", {
      From: caller.phoneE164,
      CallSid: "CA123",
      Digits: "1",
    }));

    expect(await response.text()).toContain("gate is now open");
    expect(dependencies.unlockGate).toHaveBeenCalledOnce();
    expect(dependencies.unlockGate).toHaveBeenCalledWith(expect.objectContaining({
      id: caller.userId,
      source: "twilio-voice",
      extra: expect.objectContaining({ call_sid: "CA123" }),
    }));
    expect(dependencies.finishTwilioAction).toHaveBeenCalledWith("CA123", "open", "succeeded", "opening");
  });

  it("marks the reservation failed when the controller rejects the action", async () => {
    dependencies.unlockGate.mockRejectedValueOnce(new Error("offline"));

    const response = await handleTwilioVoiceConfirmation(signedRequest("/twilio/voice/confirm", {
      From: caller.phoneE164,
      CallSid: "CA123",
      Digits: "1",
    }));

    expect(await response.text()).toContain("Unable to open the gate");
    expect(dependencies.finishTwilioAction).toHaveBeenCalledWith("CA123", "open", "failed", "offline");
  });
});
