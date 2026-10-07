import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorizeHouseholdRequest: vi.fn(), unlockGate: vi.fn() }));
vi.mock("@/lib/api-authorization", () => ({ authorizeHouseholdRequest: mocks.authorizeHouseholdRequest }));
vi.mock("@/lib/unifi-access", () => ({ unlockGate: mocks.unlockGate }));

import { sqlite } from "@/lib/database";
import { claimShortcutOpen, createShortcutPairing, getShortcutConnection, redeemShortcutPairing, revokeShortcutConnection, SHORTCUT_COOLDOWN_MS } from "@/lib/shortcuts";
import { POST as pair } from "@/app/api/shortcuts/pair/route";
import { POST as open } from "@/app/api/shortcuts/open/route";
import { GET, POST, DELETE } from "@/app/api/shortcuts/route";

function pairingCode(userId = "alice", householdId = "home", now = Date.now()) {
  const link = createShortcutPairing(userId, householdId, now);
  const input = JSON.parse(new URL(link.pairingUrl).searchParams.get("text")!);
  expect(input.url).toBe("https://gatey.test/api/shortcuts/pair");
  return input.code as string;
}

function connect(userId = "alice", householdId = "home", now = Date.now()) {
  return redeemShortcutPairing(pairingCode(userId, householdId, now), now)!;
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

describe("shortcut pairing and access", () => {
  it("redeems once, never opens during pairing, and stores only hashes", async () => {
    const code = pairingCode();
    expect(JSON.stringify(sqlite.prepare("SELECT * FROM shortcut_pairings").all())).not.toContain(code);
    const response = await pair(new Request("https://gatey.test/api/shortcuts/pair", { method: "POST", body: JSON.stringify({ code }) }));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(result.openUrl).toBe("https://gatey.test/api/shortcuts/open");
    expect(result.token).toHaveLength(43);
    expect(JSON.stringify(sqlite.prepare("SELECT * FROM shortcut_connections").all())).not.toContain(result.token);
    expect(redeemShortcutPairing(code)).toBeNull();
    expect(mocks.unlockGate).not.toHaveBeenCalled();
  });

  it("rejects expired, superseded, malformed, and revoked pairing codes", () => {
    expect(redeemShortcutPairing(pairingCode("alice", "home", 1000), 601000)).toBeNull();
    const old = pairingCode();
    const latest = pairingCode();
    expect(redeemShortcutPairing(old)).toBeNull();
    expect(redeemShortcutPairing("invalid")).toBeNull();
    revokeShortcutConnection("alice", "home");
    expect(redeemShortcutPairing(latest)).toBeNull();
  });

  it("keeps the existing key until a new pairing succeeds, then invalidates it", () => {
    const old = connect();
    const code = pairingCode();
    expect(claimShortcutOpen(old.token).state).toBe("claimed");
    const replacement = redeemShortcutPairing(code)!;
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

  it("rejects removed membership both at pairing and at opening", () => {
    const connection = connect();
    const code = pairingCode();
    sqlite.exec("DELETE FROM member WHERE user_id = 'alice'");
    expect(redeemShortcutPairing(code)).toBeNull();
    expect(claimShortcutOpen(connection.token).state).toBe("unauthorized");
    expect(() => pairingCode()).toThrow();
  });

  it("rejects banned residents even with previously issued keys", () => {
    const connection = connect();
    const code = pairingCode();
    sqlite.exec("UPDATE user SET banned = 1 WHERE id = 'alice'");
    expect(redeemShortcutPairing(code)).toBeNull();
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

  it("rejects malformed pairing bodies without side effects", async () => {
    for (const body of ["not-json", "null", "{}", '{"code":123}']) {
      expect((await pair(new Request("https://gatey.test/api/shortcuts/pair", { method: "POST", body }))).status).toBe(401);
    }
    expect(mocks.unlockGate).not.toHaveBeenCalled();
  });

  it("protects setup mutations from cross-origin requests", async () => {
    for (const origin of ["https://evil.test", "null", ""]) {
      expect((await POST(new Request("https://gatey.test/api/shortcuts", { method: "POST", headers: { origin } }))).status).toBe(403);
      expect((await DELETE(new Request("https://gatey.test/api/shortcuts", { method: "DELETE", headers: { origin } }))).status).toBe(403);
    }
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

  it("returns an installable pairing link and disconnects through the UI API", async () => {
    const response = await POST(new Request("https://gatey.test/api/shortcuts", { method: "POST", headers: { origin: "https://gatey.test" } }));
    const link = new URL((await response.json()).pairingUrl);
    expect(link.searchParams.get("name")).toBe("Open Gatey");
    const { code } = JSON.parse(link.searchParams.get("text")!);
    const { token } = redeemShortcutPairing(code)!;
    expect((await DELETE(new Request("https://gatey.test/api/shortcuts", { method: "DELETE", headers: { origin: "https://gatey.test" } }))).status).toBe(200);
    expect(claimShortcutOpen(token).state).toBe("unauthorized");
  });
});
