import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  authorizeAdminRequest: vi.fn(),
  createUser: vi.fn(),
  addMember: vi.fn(),
  removeUser: vi.fn(),
  assignPersonRecords: vi.fn(),
  getPersonLink: vi.fn(),
  linkUnifiPerson: vi.fn(),
  listAssignableAccounts: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserHousehold: vi.fn(),
  listHouseholds: vi.fn(),
  listUserInventory: vi.fn(),
  createTemporaryPassword: vi.fn(),
}));

vi.mock("@/lib/api-authorization", () => ({ authorizeAdminRequest: dependencies.authorizeAdminRequest }));
vi.mock("@/lib/auth", () => ({ auth: { api: {
  createUser: dependencies.createUser,
  addMember: dependencies.addMember,
  removeUser: dependencies.removeUser,
} } }));
vi.mock("@/lib/admin-assignments", () => ({
  assignPersonRecords: dependencies.assignPersonRecords,
  getPersonLink: dependencies.getPersonLink,
  linkUnifiPerson: dependencies.linkUnifiPerson,
  listAssignableAccounts: dependencies.listAssignableAccounts,
}));
vi.mock("@/lib/households", () => ({
  getUserByEmail: dependencies.getUserByEmail,
  getUserHousehold: dependencies.getUserHousehold,
  listHouseholds: dependencies.listHouseholds,
}));
vi.mock("@/lib/unifi-access", () => ({ listUserInventory: dependencies.listUserInventory }));
vi.mock("@/lib/welcome-message", () => ({
  buildWelcomeMessage: vi.fn(),
  createTemporaryPassword: dependencies.createTemporaryPassword,
}));

import { POST } from "@/app/api/admin/people/[id]/assignment/route";

function context(id = "person-a") {
  return { params: Promise.resolve({ id }) } as RouteContext<"/api/admin/people/[id]/assignment">;
}

describe("admin-managed residents", () => {
  beforeEach(() => {
    for (const mock of Object.values(dependencies)) mock.mockReset();
    dependencies.authorizeAdminRequest.mockResolvedValue({ context: {
      session: { user: { id: "admin-a", name: "Admin A" } },
      household: null,
      households: [],
      isSystemAdmin: true,
    } });
    dependencies.getPersonLink.mockReturnValue(null);
    dependencies.listAssignableAccounts.mockReturnValue([]);
    dependencies.getUserHousehold.mockReturnValue(null);
    dependencies.listHouseholds.mockReturnValue([{ id: "home-a", name: "Home A" }]);
    dependencies.listUserInventory.mockResolvedValue([{ id: "person-a", name: "Jane", status: "ACTIVE" }]);
    dependencies.createTemporaryPassword.mockReturnValue("random-password");
    dependencies.createUser.mockResolvedValue({ user: { id: "user-a" } });
  });

  it("creates a callable resident without collecting an email address", async () => {
    const response = await POST(new Request("https://gatey.test/api/admin/people/person-a/assignment", {
      method: "POST",
      body: JSON.stringify({ householdId: "home-a", name: "Jane", username: "marianella-jane", email: "" }),
    }), context());

    expect(response.status).toBe(201);
    expect(dependencies.createUser).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({
        email: "marianella-jane@users.gatey.invalid",
        data: expect.objectContaining({ username: "marianella-jane", emailVerified: false }),
      }),
    }));
    expect(dependencies.addMember).toHaveBeenCalledWith({ body: { userId: "user-a", organizationId: "home-a", role: "member" } });
    expect(dependencies.linkUnifiPerson).toHaveBeenCalledWith("person-a", "user-a");
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      account: expect.objectContaining({ email: null }),
    }));
  });
});
