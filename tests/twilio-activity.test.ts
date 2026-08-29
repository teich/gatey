import { beforeEach, describe, expect, it, vi } from "vitest";
import { database } from "@/lib/database";
import { twilioActionAttempts } from "@/lib/schema";
import { beginTwilioAction, recoverPendingTwilioActions } from "@/lib/twilio-activity";

const input = {
  callSid: "CA-duplicate",
  action: "open" as const,
  callerE164: "+17075551111",
  actorUserId: "user-1",
  actorName: "Resident",
  householdId: "home-a",
  householdName: "Home A",
};

describe("Twilio action reservations", () => {
  beforeEach(() => {
    database.delete(twilioActionAttempts).run();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T19:00:00.000Z"));
  });

  it("atomically reserves a CallSid/action pair only once", () => {
    const first = beginTwilioAction(input);
    const retry = beginTwilioAction(input);

    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(retry.attempt.status).toBe("pending");
  });

  it("marks uncertain in-flight actions unknown after a restart", () => {
    beginTwilioAction(input);

    expect(recoverPendingTwilioActions()).toBe(1);
    expect(beginTwilioAction(input)).toMatchObject({
      created: false,
      attempt: { status: "unknown" },
    });
  });
});
