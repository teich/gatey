import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getRequestAuth: vi.fn() }));

vi.mock("@/lib/authorization", () => ({
  getRequestAuth: mocks.getRequestAuth,
}));

import { authorizeAdminRequest, authorizeHouseholdRequest } from "@/lib/api-authorization";

const request = new Request("https://gatey.test/api/example");
const session = { user: { id: "user-1", name: "Resident", role: "user" } };

describe("API authorization policies", () => {
  beforeEach(() => mocks.getRequestAuth.mockReset());

  it("returns 401 when there is no authenticated session", async () => {
    mocks.getRequestAuth.mockResolvedValue(null);

    const result = await authorizeHouseholdRequest(request);

    expect(result.response?.status).toBe(401);
    await expect(result.response?.json()).resolves.toEqual({ error: "Sign in to continue." });
  });

  it("returns 403 when a resident has no household", async () => {
    mocks.getRequestAuth.mockResolvedValue({ session, household: null, households: [], isSystemAdmin: false });

    const result = await authorizeHouseholdRequest(request);

    expect(result.response?.status).toBe(403);
  });

  it("returns a non-null household to authorized handlers", async () => {
    const household = { id: "home-a", name: "Home A", slug: "home-a" };
    mocks.getRequestAuth.mockResolvedValue({ session, household, households: [household], isSystemAdmin: false });

    const result = await authorizeHouseholdRequest(request);

    expect(result.context?.household).toEqual(household);
  });

  it("rejects a signed-in non-administrator", async () => {
    mocks.getRequestAuth.mockResolvedValue({ session, household: null, households: [], isSystemAdmin: false });

    const result = await authorizeAdminRequest(request);

    expect(result.response?.status).toBe(403);
    await expect(result.response?.json()).resolves.toEqual({ error: "Administrator access is required." });
  });

  it("can require an administrator to have a selected household", async () => {
    mocks.getRequestAuth.mockResolvedValue({ session, household: null, households: [], isSystemAdmin: true });

    const result = await authorizeAdminRequest(request, true);

    expect(result.response?.status).toBe(403);
    await expect(result.response?.json()).resolves.toEqual({ error: "Choose a household first." });
  });
});
