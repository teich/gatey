import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  authorizeAdminRequest: vi.fn(),
  recordAuditEvent: vi.fn(),
  disableGateCode: vi.fn(),
  findHomeCode: vi.fn(),
  hasGateCodePin: vi.fn(),
  saveGateCode: vi.fn(),
  updateGateCode: vi.fn(),
  getHousehold: vi.fn(),
  generateGateCodePin: vi.fn(),
  provisionAndPersistGateCode: vi.fn(),
  replaceVisitorPin: vi.fn(),
  revokeCredential: vi.fn(),
}));

vi.mock("@/lib/api-authorization", () => ({ authorizeAdminRequest: dependencies.authorizeAdminRequest }));
vi.mock("@/lib/audit-log", () => ({ recordAuditEvent: dependencies.recordAuditEvent }));
vi.mock("@/lib/gate-codes", () => ({
  disableGateCode: dependencies.disableGateCode,
  findHomeCode: dependencies.findHomeCode,
  hasGateCodePin: dependencies.hasGateCodePin,
  saveGateCode: dependencies.saveGateCode,
  updateGateCode: dependencies.updateGateCode,
}));
vi.mock("@/lib/households", () => ({ getHousehold: dependencies.getHousehold }));
vi.mock("@/lib/unifi-access", () => ({
  generateGateCodePin: dependencies.generateGateCodePin,
  provisionAndPersistGateCode: dependencies.provisionAndPersistGateCode,
  replaceVisitorPin: dependencies.replaceVisitorPin,
  revokeCredential: dependencies.revokeCredential,
}));

import { DELETE, PATCH, POST } from "@/app/api/admin/households/[id]/gate-code/route";

const authorization = {
  context: {
    session: { user: { id: "admin-a", name: "Admin A" } },
    household: null,
    households: [],
    isSystemAdmin: true,
  },
};
const household = { id: "home-a", name: "Home A", slug: "home-a", members: [], visitorCount: 0, gateCode: null };
const code = {
  id: "code-a",
  label: "Home A gate code",
  pin: "2468",
  kind: "home",
  startsAt: "2026-01-01T00:00:00.000Z",
  controllerEndsAt: "2040-01-01T00:00:00.000Z",
  controllerVisitorId: "visitor-a",
  state: "active",
};

function context(id = "home-a") {
  return { params: Promise.resolve({ id }) } as RouteContext<"/api/admin/households/[id]/gate-code">;
}

describe("admin household gate-code routes", () => {
  beforeEach(() => {
    for (const mock of Object.values(dependencies)) mock.mockReset();
    dependencies.authorizeAdminRequest.mockResolvedValue(authorization);
    dependencies.getHousehold.mockReturnValue(household);
    dependencies.hasGateCodePin.mockReturnValue(false);
  });

  it("creates a household code without requiring any household members", async () => {
    dependencies.findHomeCode.mockReturnValueOnce(undefined).mockReturnValue(code);
    dependencies.saveGateCode.mockReturnValue(code.id);
    dependencies.provisionAndPersistGateCode.mockImplementation(async (_input, persist) => ({
      visitorId: code.controllerVisitorId,
      persisted: persist(code.controllerVisitorId),
    }));

    const response = await POST(new Request("https://gatey.test/api/admin/households/home-a/gate-code", {
      method: "POST",
      body: JSON.stringify({ pin: code.pin }),
    }), context());

    expect(response.status).toBe(201);
    expect(dependencies.saveGateCode).toHaveBeenCalledWith(expect.objectContaining({ householdId: "home-a", kind: "home", pin: "2468" }));
    expect(dependencies.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: "admin-a", householdId: "home-a", action: "gate-code.created" }));
    expect(dependencies.recordAuditEvent.mock.calls[0][0].details).not.toHaveProperty("pin");
  });

  it("looks up the household from the route instead of the admin's active household", async () => {
    dependencies.getHousehold.mockReturnValue(null);

    const response = await POST(new Request("https://gatey.test/api/admin/households/missing/gate-code", {
      method: "POST",
      body: JSON.stringify({ pin: "2468" }),
    }), context("missing"));

    expect(response.status).toBe(404);
    expect(dependencies.getHousehold).toHaveBeenCalledWith("missing");
    expect(dependencies.provisionAndPersistGateCode).not.toHaveBeenCalled();
  });

  it("rejects an invalid manual PIN before provisioning", async () => {
    dependencies.findHomeCode.mockReturnValue(undefined);

    const response = await POST(new Request("https://gatey.test/api/admin/households/home-a/gate-code", {
      method: "POST",
      body: JSON.stringify({ pin: "12" }),
    }), context());

    expect(response.status).toBe(400);
    expect(dependencies.provisionAndPersistGateCode).not.toHaveBeenCalled();
  });

  it("restores the controller PIN when local replacement persistence fails", async () => {
    dependencies.findHomeCode.mockReturnValue(code);
    dependencies.updateGateCode.mockImplementation(() => { throw new Error("database unavailable"); });

    const response = await PATCH(new Request("https://gatey.test/api/admin/households/home-a/gate-code", {
      method: "PATCH",
      body: JSON.stringify({ pin: "1357" }),
    }), context());

    expect(response.status).toBe(424);
    expect(dependencies.replaceVisitorPin).toHaveBeenNthCalledWith(1, "visitor-a", "1357");
    expect(dependencies.replaceVisitorPin).toHaveBeenNthCalledWith(2, "visitor-a", "2468");
  });

  it("revokes and disables the household code", async () => {
    dependencies.findHomeCode.mockReturnValue(code);

    const response = await DELETE(new Request("https://gatey.test/api/admin/households/home-a/gate-code", { method: "DELETE" }), context());

    expect(response.status).toBe(200);
    expect(dependencies.revokeCredential).toHaveBeenCalledWith("visitor-a");
    expect(dependencies.disableGateCode).toHaveBeenCalledWith("home-a", "code-a");
  });
});
