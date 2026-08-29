import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { database } from "@/lib/database";
import { unifiInventorySnapshot } from "@/lib/schema";
import { getUnifiInventorySnapshot, refreshUnifiInventory } from "@/lib/unifi-inventory-cache";

type ControllerUser = {
  id: string;
  full_name: string;
  status: string;
  pin_code?: { token: string };
  access_policies?: Array<{ name: string }>;
  nfc_cards?: unknown[];
};

type ControllerVisitor = {
  id: string;
  first_name: string;
  status: string;
  start_time?: number;
  end_time?: number;
  pin_code?: string;
};

function mockInventory(users: ControllerUser[], visitors: ControllerVisitor[]) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const data = url.includes("/users?") ? users : visitors;
    return Response.json({ code: "SUCCESS", data });
  }));
}

describe("durable UniFi inventory cache", () => {
  beforeEach(() => {
    database.delete(unifiInventorySnapshot).run();
    process.env.UNIFI_HOST = "controller.test";
    process.env.UNIFI_ACCESS_API_TOKEN = "token";
    delete process.env.UNIFI_INSECURE_TLS;
  });

  afterEach(() => vi.unstubAllGlobals());

  it("serves the last snapshot and only increments its version when inventory changes", async () => {
    expect(getUnifiInventorySnapshot()).toEqual({ users: [], visitors: [], version: 0 });

    mockInventory(
      [{ id: "user-1", full_name: "Ada", status: "ACTIVE", access_policies: [{ name: "Residents" }] }],
      [{ id: "visitor-1", first_name: "Grace", status: "VISITING", pin_code: "1234" }],
    );
    await expect(refreshUnifiInventory({ force: true })).resolves.toMatchObject({
      changed: true,
      usersChanged: true,
      visitorsChanged: true,
      version: 1,
    });
    expect(getUnifiInventorySnapshot()).toMatchObject({
      version: 1,
      users: [{ id: "user-1", name: "Ada", status: "ACTIVE" }],
      visitors: [{ id: "visitor-1", name: "Grace", status: "VISITING" }],
    });

    await expect(refreshUnifiInventory({ force: true })).resolves.toMatchObject({ changed: false, version: 1 });

    mockInventory(
      [{ id: "user-1", full_name: "Ada Lovelace", status: "ACTIVE", access_policies: [{ name: "Residents" }] }],
      [{ id: "visitor-1", first_name: "Grace", status: "VISITING", pin_code: "1234" }],
    );
    await expect(refreshUnifiInventory({ force: true })).resolves.toMatchObject({
      changed: true,
      usersChanged: true,
      visitorsChanged: false,
      version: 2,
    });
    expect(getUnifiInventorySnapshot().users[0]?.name).toBe("Ada Lovelace");
  });

  it("keeps the last successful data when a refresh fails", async () => {
    mockInventory([{ id: "user-1", full_name: "Ada", status: "ACTIVE" }], []);
    await expect(refreshUnifiInventory({ force: true })).resolves.toMatchObject({ recovered: false });

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("/users?")) {
        return Response.json({ code: "FAILED", msg: "controller busy" }, { status: 503 });
      }
      return Response.json({ code: "SUCCESS", data: [] });
    }));
    await expect(refreshUnifiInventory({ force: true })).rejects.toThrow("controller busy");

    const snapshot = getUnifiInventorySnapshot();
    expect(snapshot.users[0]?.name).toBe("Ada");
    expect(snapshot.lastError).toBe("controller busy");

    mockInventory([{ id: "user-1", full_name: "Ada", status: "ACTIVE" }], []);
    await expect(refreshUnifiInventory({ force: true })).resolves.toMatchObject({
      changed: false,
      recovered: true,
    });
    expect(getUnifiInventorySnapshot().lastError).toBeUndefined();
  });
});
