import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  authorizeHouseholdRequest: vi.fn(),
  findGateCode: vi.fn(),
  hasGateCodePin: vi.fn(),
  updateGateCode: vi.fn(),
  disableGateCode: vi.fn(),
  replaceVisitorPin: vi.fn(),
  revokeCredential: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/api-authorization", () => ({ authorizeHouseholdRequest: dependencies.authorizeHouseholdRequest }));
vi.mock("@/lib/gate-codes", () => ({
  findGateCode: dependencies.findGateCode,
  hasGateCodePin: dependencies.hasGateCodePin,
  updateGateCode: dependencies.updateGateCode,
  disableGateCode: dependencies.disableGateCode,
}));
vi.mock("@/lib/unifi-access", () => ({
  replaceVisitorPin: dependencies.replaceVisitorPin,
  revokeCredential: dependencies.revokeCredential,
}));
vi.mock("@/lib/audit-log", () => ({ recordAuditEvent: dependencies.recordAuditEvent }));

import { DELETE, PATCH } from "@/app/api/gate-codes/[id]/route";

const authorization = {
  context: {
    session: { user: { id: "user-a", name: "Resident A" } },
    household: { id: "home-a", name: "Home A", slug: "home-a" },
    households: [],
    isSystemAdmin: false,
  },
};

function context(id: string) {
  return { params: Promise.resolve({ id }) } as RouteContext<"/api/gate-codes/[id]">;
}

describe("household-scoped gate-code routes", () => {
  beforeEach(() => {
    for (const mock of Object.values(dependencies)) mock.mockReset();
    dependencies.authorizeHouseholdRequest.mockResolvedValue(authorization);
  });

  it.each([
    ["PATCH", PATCH],
    ["DELETE", DELETE],
  ])("scopes %s lookup before any controller mutation", async (method, handler) => {
    dependencies.findGateCode.mockReturnValue(undefined);
    const request = new Request("https://gatey.test/api/gate-codes/code-from-home-b", {
      method,
      ...(method === "PATCH" ? { body: JSON.stringify({ label: "Changed" }) } : {}),
    });

    const response = await handler(request, context("code-from-home-b"));

    expect(response.status).toBe(404);
    expect(dependencies.findGateCode).toHaveBeenCalledWith("home-a", "code-from-home-b");
    expect(dependencies.replaceVisitorPin).not.toHaveBeenCalled();
    expect(dependencies.revokeCredential).not.toHaveBeenCalled();
  });

  const activeCode = {
    id: "code-a",
    label: "Gardener",
    pin: "2468",
    kind: "ongoing",
    startsAt: "2026-01-01T00:00:00.000Z",
    controllerEndsAt: "2040-01-01T00:00:00.000Z",
    controllerVisitorId: "visitor-a",
    state: "active",
  };

  function patchPin(pin: string) {
    return PATCH(
      new Request("https://gatey.test/api/gate-codes/code-a", { method: "PATCH", body: JSON.stringify({ pin }) }),
      context("code-a"),
    );
  }

  it("does not confirm that a conflicting PIN belongs to another household, and audits the attempt", async () => {
    dependencies.findGateCode.mockReturnValue(activeCode);
    dependencies.hasGateCodePin.mockReturnValue(true);

    const response = await patchPin("1357");

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "This code can't be used. Choose a different one." });
    expect(dependencies.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "gate-code.pin-unavailable", householdId: "home-a" }),
    );
    expect(dependencies.replaceVisitorPin).not.toHaveBeenCalled();
  });

  it("does not show residents the controller's error text", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    dependencies.findGateCode.mockReturnValue(activeCode);
    dependencies.hasGateCodePin.mockReturnValue(false);
    dependencies.replaceVisitorPin.mockRejectedValue(new Error("CODE_PIN_EXISTS visitor-b"));

    const response = await patchPin("1357");

    expect(response.status).toBe(424);
    await expect(response.json()).resolves.toEqual({ error: "Could not update this gate code." });
  });
});
