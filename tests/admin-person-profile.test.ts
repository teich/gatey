import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  authorizeAdminRequest: vi.fn(),
  adminUpdateUser: vi.fn(),
  getPersonLink: vi.fn(),
  reassignPersonHousehold: vi.fn(),
  validatePersonHouseholdReassignment: vi.fn(),
  listHouseholds: vi.fn(),
  replaceUserPhoneNumbers: vi.fn(),
}));

vi.mock("@/lib/api-authorization", () => ({ authorizeAdminRequest: dependencies.authorizeAdminRequest }));
vi.mock("@/lib/auth", () => ({ auth: { api: { adminUpdateUser: dependencies.adminUpdateUser } } }));
vi.mock("@/lib/admin-assignments", () => ({
  getPersonLink: dependencies.getPersonLink,
  reassignPersonHousehold: dependencies.reassignPersonHousehold,
  validatePersonHouseholdReassignment: dependencies.validatePersonHouseholdReassignment,
}));
vi.mock("@/lib/households", () => ({ listHouseholds: dependencies.listHouseholds }));
vi.mock("@/lib/phone-access", () => ({
  normalizeE164: (value: string) => {
    const compact = value.trim().replace(/[\s().-]/g, "");
    if (!/^\+[1-9]\d{1,14}$/.test(compact)) throw new Error("Phone number must use E.164 format, such as +17075551111.");
    return compact;
  },
  replaceUserPhoneNumbers: dependencies.replaceUserPhoneNumbers,
}));

import { PATCH } from "@/app/api/admin/people/[id]/profile/route";

function context(id = "person-a") {
  return { params: Promise.resolve({ id }) } as RouteContext<"/api/admin/people/[id]/profile">;
}

describe("admin person profile", () => {
  beforeEach(() => {
    for (const mock of Object.values(dependencies)) mock.mockReset();
    dependencies.authorizeAdminRequest.mockResolvedValue({ context: { isSystemAdmin: true } });
    dependencies.getPersonLink.mockReturnValue({ userId: "user-a", username: "jane", householdId: "home-a" });
    dependencies.listHouseholds.mockReturnValue([{ id: "home-b", name: "Home B" }]);
    dependencies.adminUpdateUser.mockResolvedValue({ user: { id: "user-a" } });
  });

  it("saves account, household, and phone changes as one request", async () => {
    const phones = [{
      id: "phone-a",
      phoneE164: "+1 707 555 1111",
      label: "Mobile",
      notes: "Jane",
      enabled: true,
      canOpen: true,
      canHoldOpen: false,
    }];
    const response = await PATCH(new Request("https://gatey.test/api/admin/people/person-a/profile", {
      method: "PATCH",
      body: JSON.stringify({ name: "Jane Resident", email: "jane@example.com", householdId: "home-b", phones }),
    }), context());

    expect(response.status).toBe(200);
    expect(dependencies.adminUpdateUser).toHaveBeenCalledWith(expect.objectContaining({
      body: { userId: "user-a", data: { name: "Jane Resident", email: "jane@example.com", emailVerified: true } },
    }));
    expect(dependencies.reassignPersonHousehold).toHaveBeenCalledWith("person-a", "user-a", "home-b");
    expect(dependencies.replaceUserPhoneNumbers).toHaveBeenCalledWith("user-a", [{ ...phones[0], phoneE164: "+17075551111" }]);
  });

  it("validates every part of the draft before changing the account", async () => {
    const response = await PATCH(new Request("https://gatey.test/api/admin/people/person-a/profile", {
      method: "PATCH",
      body: JSON.stringify({ name: "Jane", email: "", householdId: "home-b", phones: [{ phoneE164: "17075551111", label: "Mobile" }] }),
    }), context());

    expect(response.status).toBe(400);
    expect(dependencies.adminUpdateUser).not.toHaveBeenCalled();
    expect(dependencies.replaceUserPhoneNumbers).not.toHaveBeenCalled();
  });
});
