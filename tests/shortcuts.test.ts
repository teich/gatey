import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorizeHouseholdRequest: vi.fn(), unlockGate: vi.fn() }));
vi.mock("@/lib/api-authorization", () => ({ authorizeHouseholdRequest: mocks.authorizeHouseholdRequest }));
vi.mock("@/lib/unifi-access", () => ({ unlockGate: mocks.unlockGate }));

import { sqlite } from "@/lib/database";
import { claimShortcutOpen, createShortcutConnection, getShortcutConnection, revokeShortcutConnection, SHORTCUT_COOLDOWN_MS } from "@/lib/shortcuts";
import { POST as open } from "@/app/api/shortcuts/open/route";
import { GET, POST, DELETE } from "@/app/api/shortcuts/route";
import { rejectsCrossOriginMutation } from "@/lib/request-origin";

function connect(userId = "alice", householdId = "home", now = Date.now()) {
  return createShortcutConnection(userId, householdId, now);
}

function openRequest(token: string) {
  return new Request("https://gatey.test/api/shortcuts/open", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
}

beforeEach(() => {
  process.env.BETTER_AUTH_URL = "https://gatey.test";
  sqlite.exec(`DELETE FROM shortcut_pairings; DELETE FROM shortcut_connections; DELETE FROM audit_events; DELETE FROM member; DELETE FROM organization; DELETE FROM user;`);
  for (const id of ["alice", "bob"]) {
    sqlite.prepare("INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 0)").run(id, id, `${id}@test.invalid`);
  }
  sqlite.exec("INSERT INTO organization (id, name, slug, created_at) VALUES ('home', 'Home', 'home', 0), ('other', 'Other', 'other', 0)");
  sqlite.exec("INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ('ma', 'home', 'alice', 'member', 0), ('mb', 'other', 'bob', 'member', 0)");
  mocks.authorizeHouseholdRequest.mockResolvedValue({ context: { session: { user: { id: "alice", name: "Alice" } }, household: { id: "home", name: "Home" } } });
  mocks.unlockGate.mockResolvedValue({ state: "open" });
});

describe("shortcut access", () => {
  it("issues a key directly without opening and stores only its hash", async () => {
    const response = await POST(new Request("https://gatey.test/api/shortcuts", { method: "POST", headers: { origin: "https://gatey.test" } }));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(result.openUrl).toBe("https://gatey.test/api/shortcuts/open");
    expect(result.token).toHaveLength(43);
    expect(result.connection.id).toBeTruthy();
    expect(JSON.stringify(sqlite.prepare("SELECT * FROM shortcut_connections").all())).not.toContain(result.token);
    expect(sqlite.prepare("SELECT count(*) AS count FROM shortcut_pairings").get()?.count).toBe(0);
    expect(mocks.unlockGate).not.toHaveBeenCalled();
  });

  it("invalidates the previous key when creating a replacement", () => {
    const old = connect();
    const replacement = connect();
    expect(claimShortcutOpen(old.token).state).toBe("unauthorized");
    expect(claimShortcutOpen(replacement.token).state).toBe("claimed");
  });

  it("revokes one resident without affecting the other", () => {
    const alice = connect();
    const bob = connect("bob", "other");
    revokeShortcutConnection("alice", "home");
    expect(claimShortcutOpen(alice.token).state).toBe("unauthorized");
    expect(claimShortcutOpen(bob.token).state).toBe("claimed");
  });

  it("rejects removed membership both at creation and at opening", () => {
    const connection = connect();
    sqlite.exec("DELETE FROM member WHERE user_id = 'alice'");
    expect(claimShortcutOpen(connection.token).state).toBe("unauthorized");
    expect(() => connect()).toThrow();
  });

  it("rejects banned residents even with previously issued keys", () => {
    const connection = connect();
    sqlite.exec("UPDATE user SET banned = 1 WHERE id = 'alice'");
    expect(claimShortcutOpen(connection.token).state).toBe("unauthorized");
  });

  it("atomically claims one opening per cooldown period", () => {
    const { token } = connect();
    expect(claimShortcutOpen(token, 1000).state).toBe("claimed");
    expect(claimShortcutOpen(token, 1000).state).toBe("cooldown");
    expect(claimShortcutOpen(token, 1000 + SHORTCUT_COOLDOWN_MS).state).toBe("claimed");
  });
});

describe("shortcut routes", () => {
  it("opens as the resident, audits source, and reports accepted opening", async () => {
    const { token } = connect();
    const response = await open(openRequest(token));
    expect(response.status).toBe(200);
    expect(mocks.unlockGate).toHaveBeenCalledWith({ id: "alice", name: "alice" });
    expect(getShortcutConnection("alice", "home")?.lastUsedAt).toBeTypeOf("number");
    expect(sqlite.prepare("SELECT actor_user_id, action, outcome, details FROM audit_events").get()).toEqual({ actor_user_id: "alice", action: "gate.open", outcome: "succeeded", details: JSON.stringify({ source: "shortcut" }) });
    expect((await open(openRequest(token))).status).toBe(429);
    expect(mocks.unlockGate).toHaveBeenCalledTimes(1);
  });

  it("fails closed without a valid bearer token or after disconnect", async () => {
    const { token } = connect();
    for (const invalid of ["", "bad", "a".repeat(43)]) expect((await open(openRequest(invalid))).status).toBe(401);
    revokeShortcutConnection("alice", "home");
    expect((await open(openRequest(token))).status).toBe(401);
    expect(mocks.unlockGate).not.toHaveBeenCalled();
  });

  it("does not retry an ambiguous controller failure", async () => {
    const { token } = connect();
    mocks.unlockGate.mockRejectedValue(new Error("timeout"));
    expect((await open(openRequest(token))).status).toBe(503);
    expect((await open(openRequest(token))).status).toBe(429);
    expect(mocks.unlockGate).toHaveBeenCalledTimes(1);
    expect(getShortcutConnection("alice", "home")?.lastUsedAt).toBeNull();
    expect(sqlite.prepare("SELECT outcome FROM audit_events").get()?.outcome).toBe("failed");
  });

  it("protects setup mutations from cross-origin requests", () => {
    for (const origin of ["https://evil.test", "https://other.gatey.test", "null", ""]) {
      for (const method of ["POST", "DELETE"]) {
        expect(rejectsCrossOriginMutation(new Request("https://gatey.test/api/shortcuts", { method, headers: { origin } }))).toBe(true);
      }
    }
    expect(rejectsCrossOriginMutation(new Request("https://gatey.test/api/shortcuts", { method: "POST", headers: { origin: "https://gatey.test" } }))).toBe(false);
    expect(rejectsCrossOriginMutation(new Request("https://gatey.test/api/shortcuts"))).toBe(false);
    // The native shortcut authenticates with its own bearer token.
    expect(rejectsCrossOriginMutation(openRequest("token"))).toBe(false);
  });

  it("requires a web session to manage access and never lists secrets", async () => {
    const { token } = connect();
    const response = await GET(new Request("https://gatey.test/api/shortcuts"));
    const body = await response.text();
    expect(body).not.toContain(token);
    expect(body).not.toContain("tokenHash");
    mocks.authorizeHouseholdRequest.mockResolvedValue({ response: new Response(null, { status: 401 }) });
    expect((await GET(new Request("https://gatey.test/api/shortcuts"))).status).toBe(401);
    expect((await POST(new Request("https://gatey.test/api/shortcuts", { method: "POST", headers: { origin: "https://gatey.test" } }))).status).toBe(401);
  });

  it("disconnects a directly issued key through the UI API", async () => {
    const response = await POST(new Request("https://gatey.test/api/shortcuts", { method: "POST", headers: { origin: "https://gatey.test" } }));
    const { token } = await response.json();
    expect((await DELETE(new Request("https://gatey.test/api/shortcuts", { method: "DELETE", headers: { origin: "https://gatey.test" } }))).status).toBe(200);
    expect(claimShortcutOpen(token).state).toBe("unauthorized");
  });
});
