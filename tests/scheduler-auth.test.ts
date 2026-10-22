import { beforeEach, describe, expect, it } from "vitest";
import { schedulerAuthorized } from "@/lib/scheduler-auth";

function request(headers: Record<string, string>) {
  return new Request("http://127.0.0.1:3000/api/internal/party-reconcile", { method: "POST", headers });
}

describe("scheduler authorization", () => {
  beforeEach(() => {
    process.env.GATEY_SCHEDULER_SECRET = "scheduler-secret";
  });

  it("accepts the local timer's secret", () => {
    expect(schedulerAuthorized(request({ authorization: "Bearer scheduler-secret" }))).toBe(true);
  });

  it("rejects a wrong or missing secret", () => {
    expect(schedulerAuthorized(request({ authorization: "Bearer scheduler-secreT" }))).toBe(false);
    expect(schedulerAuthorized(request({}))).toBe(false);
    delete process.env.GATEY_SCHEDULER_SECRET;
    expect(schedulerAuthorized(request({ authorization: "Bearer " }))).toBe(false);
  });

  it("rejects requests that arrived through the Cloudflare tunnel, even with the secret", () => {
    expect(schedulerAuthorized(request({ authorization: "Bearer scheduler-secret", "cf-connecting-ip": "203.0.113.5" }))).toBe(false);
  });
});
