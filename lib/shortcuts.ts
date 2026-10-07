import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { database } from "@/lib/database";
import { member, organization, shortcutConnections, shortcutPairings, user } from "@/lib/schema";

const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
export const SHORTCUT_NAME = "Open Gatey";
export const SHORTCUT_COOLDOWN_MS = 30_000;
export const shortcutHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export function shortcutBaseUrl() {
  const url = new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Shortcut setup requires an HTTPS BETTER_AUTH_URL.");
  }
  return url.origin;
}

// Cookie-authenticated mutations must originate in Gatey. Native requests use
// separate endpoints and possession of a random pairing code or opening token.
export function isShortcutSetupRequest(request: Request) {
  return request.headers.get("origin") === shortcutBaseUrl();
}

function activeResident(userId: string, householdId: string) {
  return database.select({ userId: user.id, actorName: user.name, householdId: organization.id, householdName: organization.name })
    .from(user).innerJoin(member, eq(member.userId, user.id))
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(user.id, userId), eq(organization.id, householdId), or(isNull(user.banned), eq(user.banned, false), lt(user.banExpires, new Date()))))
    .get();
}

export function getShortcutConnection(userId: string, householdId: string) {
  return database.select({ id: shortcutConnections.id, createdAt: shortcutConnections.createdAt, lastUsedAt: shortcutConnections.lastUsedAt })
    .from(shortcutConnections).where(and(eq(shortcutConnections.userId, userId), eq(shortcutConnections.householdId, householdId))).get() ?? null;
}

export function createShortcutPairing(userId: string, householdId: string, now = Date.now()) {
  if (!activeResident(userId, householdId)) throw new Error("Resident access is no longer available.");
  const code = secret();
  const expiresAt = now + 10 * 60_000;
  database.transaction((tx) => {
    tx.delete(shortcutPairings).where(or(lt(shortcutPairings.expiresAt, now), and(eq(shortcutPairings.userId, userId), eq(shortcutPairings.householdId, householdId)))).run();
    tx.insert(shortcutPairings).values({ codeHash: hash(code), userId, householdId, expiresAt }).run();
  });
  const input = JSON.stringify({ url: `${shortcutBaseUrl()}/api/shortcuts/pair`, code });
  const params = new URLSearchParams({ name: SHORTCUT_NAME, input: "text", text: input });
  return { pairingUrl: `shortcuts://run-shortcut?${params}`, expiresAt };
}

export function redeemShortcutPairing(code: string, now = Date.now()) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) return null;
  // Resolve configuration before consuming a one-time code.
  const openUrl = `${shortcutBaseUrl()}/api/shortcuts/open`;
  return database.transaction((tx) => {
    const pairing = tx.delete(shortcutPairings).where(and(eq(shortcutPairings.codeHash, hash(code)), gt(shortcutPairings.expiresAt, now))).returning().get();
    if (!pairing || !activeResident(pairing.userId, pairing.householdId)) return null;
    const token = secret();
    tx.delete(shortcutConnections).where(and(eq(shortcutConnections.userId, pairing.userId), eq(shortcutConnections.householdId, pairing.householdId))).run();
    tx.insert(shortcutConnections).values({ id: randomUUID(), userId: pairing.userId, householdId: pairing.householdId, tokenHash: hash(token), createdAt: now }).run();
    return { token, openUrl };
  });
}

export function revokeShortcutConnection(userId: string, householdId: string) {
  database.transaction((tx) => {
    tx.delete(shortcutConnections).where(and(eq(shortcutConnections.userId, userId), eq(shortcutConnections.householdId, householdId))).run();
    tx.delete(shortcutPairings).where(and(eq(shortcutPairings.userId, userId), eq(shortcutPairings.householdId, householdId))).run();
  });
}

export function claimShortcutOpen(token: string, now = Date.now()) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { state: "unauthorized" } as const;
  return database.transaction((tx) => {
    const connection = tx.select().from(shortcutConnections).where(eq(shortcutConnections.tokenHash, hash(token))).get();
    const resident = connection && activeResident(connection.userId, connection.householdId);
    if (!connection || !resident) return { state: "unauthorized" } as const;
    // Claim before network I/O, including on failures: overlapping automations
    // and ambiguous controller timeouts must not immediately pulse the gate twice.
    const claimed = tx.update(shortcutConnections).set({ lastAttemptAt: now })
      .where(and(eq(shortcutConnections.id, connection.id), or(isNull(shortcutConnections.lastAttemptAt), sql`${shortcutConnections.lastAttemptAt} <= ${now - SHORTCUT_COOLDOWN_MS}`)))
      .returning({ id: shortcutConnections.id }).get();
    if (!claimed) return { state: "cooldown" } as const;
    return { state: "claimed", connectionId: connection.id, ...resident } as const;
  });
}

export function markShortcutUsed(connectionId: string) {
  database.update(shortcutConnections).set({ lastUsedAt: Date.now() }).where(eq(shortcutConnections.id, connectionId)).run();
}
