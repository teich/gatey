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
});
