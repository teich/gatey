import "server-only";

import { Agent, request as httpsRequest } from "node:https";
import { eq } from "drizzle-orm";
import { database } from "@/lib/database";
import { unifiPersonLinks } from "@/lib/schema";

type ApiResponse<T> = {
  code?: string;
  data?: T;
  msg?: string;
  message?: string;
  pagination?: { page_num?: number; page_size?: number; total?: number };
};
type Door = {
  id: string;
  name: string;
  type: string;
  is_bind_hub?: boolean;
  door_lock_relay_status?: string | null;
  door_position_status?: string | null;
};

type UnifiVisitor = {
  id: string;
  first_name?: string;
  last_name?: string;
  status?: string;
  start_time?: number;
  end_time?: number;
  pin_code?: string | null;
  schedule?: unknown;
  resources?: Array<{ name?: string; type?: string }>;
};

type UnifiSystemLog = {
  "@timestamp"?: string;
  _id?: string;
  _source?: {
    actor?: {
      id?: string;
      type?: string;
      display_name?: string;
      alternate_name?: string;
    };
    authentication?: {
      credential_provider?: string;
      issuer?: string;
    };
    event?: {
      published?: number;
      result?: string;
      type?: string;
      display_message?: string;
      reason?: string;
    };
    target?: Array<{
      id?: string;
      type?: string;
      display_name?: string;
    }>;
  };
};

export type UnifiAccessLogPage = {
  hits: UnifiSystemLog[];
  pageNum: number;
  pageSize: number;
  total: number;
};

export type ConfiguredGateIdentity = {
  id: string;
  name: string;
};

type UnifiUser = {
  id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  alias?: string;
  status?: string;
  pin_code?: { token?: string } | null;
  access_policies?: Array<{ name?: string }>;
  nfc_cards?: unknown[];
};

const insecureUnifiAgent = new Agent({ rejectUnauthorized: false });
const GATE_STATUS_TTL_MS = 5_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

type CachedGateStatus = {
  value: GateStatus;
  expiresAt: number;
};

const globalForGateStatus = globalThis as unknown as {
  gateyGateStatus?: CachedGateStatus;
  gateyGateStatusPromise?: Promise<GateStatus>;
  gateyCredentialLastUses?: Map<string, { value: string | undefined; expiresAt: number }>;
};

const CREDENTIAL_LAST_USE_TTL_MS = 60_000;

function assertControllerChangesAllowed() {
  if (["1", "true", "yes"].includes((process.env.GATEY_UNIFI_WRITES || "").toLowerCase())) return;
  throw new Error("Gate code and party-mode changes are enabled only on Gatey's production server.");
}

export type VisitorInventoryItem = {
  id: string;
  name: string;
  status: string;
  startsAt?: string;
  endsAt?: string;
  hasPin: boolean;
  recurring: boolean;
  resources: string[];
};

export type UserInventoryItem = {
  id: string;
  name: string;
  status: string;
  hasPin: boolean;
  policyNames: string[];
  hasNfcCard: boolean;
};

export type GateStatus = {
  state: "closed" | "opening" | "open" | "unknown";
  position: string | null;
  relay: string | null;
};

function cacheGateStatus(value: GateStatus) {
  globalForGateStatus.gateyGateStatus = { value, expiresAt: Date.now() + GATE_STATUS_TTL_MS };
  return value;
}

function timestampToIso(timestamp?: number): string | undefined {
  if (typeof timestamp !== "number") return undefined;
  const milliseconds = timestamp > 100_000_000_000 ? timestamp : timestamp * 1_000;
  return new Date(milliseconds).toISOString();
}

function config() {
  const host = process.env.UNIFI_HOST;
  const token = process.env.UNIFI_ACCESS_API_TOKEN;
  if (!host || !token) throw new Error("Gatey is missing its UniFi connection settings.");
  return {
    baseUrl: `https://${host}:${process.env.UNIFI_ACCESS_PORT || "12445"}/api/v1/developer`,
    token,
    doorName: (process.env.UNIFI_DOOR_NAME || "Gate").trim(),
    insecureTls: ["1", "true", "yes"].includes((process.env.UNIFI_INSECURE_TLS || "").toLowerCase()),
  };
}

async function unifiFetch(url: string, init: RequestInit, insecureTls: boolean): Promise<Response> {
  if (!insecureTls) return fetch(url, init);

  const body = init.body;
  if (body && typeof body !== "string" && !(body instanceof Uint8Array)) {
    throw new Error("UniFi requests only support string or byte request bodies.");
  }

  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, {
      method: init.method,
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      agent: insecureUnifiAgent,
      signal: init.signal ?? undefined,
    }, (response) => {
      const chunks: Uint8Array[] = [];
      response.on("data", (chunk: Uint8Array) => chunks.push(chunk));
      response.on("end", () => {
        resolve(new Response(new Uint8Array(Buffer.concat(chunks)), {
          status: response.statusCode || 500,
          headers: response.headers as HeadersInit,
        }));
      });
    });
    request.on("error", reject);
    request.end(body || undefined);
  });
}

async function requestEnvelope<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const { baseUrl, token, insecureTls } = config();
  const signal = init.signal ?? AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS);
  const response = await unifiFetch(`${baseUrl}${path}`, {
    ...init,
    signal,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init.headers || {}) },
    cache: "no-store",
  }, insecureTls);
  const body = await response.json().catch(() => ({})) as ApiResponse<T>;
  if (!response.ok || !["SUCCESS", "OK"].includes(String(body.code || "").toUpperCase())) {
    throw new Error(body.msg || body.message || body.code || `UniFi request failed (${response.status})`);
  }
  return body;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await requestEnvelope<T>(path, init)).data as T;
}

async function gateDoor(): Promise<Door> {
  const { doorName } = config();
  const doors = await request<Door[]>("/doors");
  const door = doors.find((item) => item.name.trim().toLowerCase() === doorName.toLowerCase());
  if (!door) throw new Error(`UniFi could not find the '${doorName}' gate.`);
  return door;
}

export async function getConfiguredGateIdentity(): Promise<ConfiguredGateIdentity> {
  const door = await gateDoor();
  return { id: door.id, name: door.name };
}

export async function fetchAccessLogPage(input: {
  since: number;
  until: number;
  pageNum: number;
  pageSize?: number;
}): Promise<UnifiAccessLogPage> {
  const pageNum = Math.max(1, Math.floor(input.pageNum));
  const pageSize = Math.max(1, Math.min(100, Math.floor(input.pageSize || 100)));
  const response = await requestEnvelope<{ hits?: UnifiSystemLog[] }>(`/system/logs?page_num=${pageNum}&page_size=${pageSize}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: "door_openings",
      since: Math.floor(input.since),
      until: Math.floor(input.until),
    }),
  });
  return {
    hits: response.data?.hits || [],
    pageNum: response.pagination?.page_num || pageNum,
    pageSize: response.pagination?.page_size || pageSize,
    total: response.pagination?.total || 0,
  };
}

function gateStatus(door: Door): GateStatus {
  const position = door.door_position_status || null;
  const relay = door.door_lock_relay_status || null;

  if (position === "open") return { state: "open", position, relay };
  if (position === "close" && relay === "unlock") return { state: "opening", position, relay };
  if (position === "close") return { state: "closed", position, relay };
  return { state: "unknown", position, relay };
}

export async function getGateStatus(options: { fresh?: boolean } = {}): Promise<GateStatus> {
  const cached = globalForGateStatus.gateyGateStatus;
  if (!options.fresh && cached && cached.expiresAt > Date.now()) return cached.value;

  const existing = globalForGateStatus.gateyGateStatusPromise;
  if (existing) return existing;

  const statusRequest = gateDoor()
    .then(gateStatus)
    .then(cacheGateStatus)
    .finally(() => {
      delete globalForGateStatus.gateyGateStatusPromise;
    });
  globalForGateStatus.gateyGateStatusPromise = statusRequest;
  return statusRequest;
}

export async function unlockGate(actor: { id: string; name: string; source?: "gatey" | "twilio-voice"; extra?: Record<string, string> }): Promise<GateStatus> {
  const door = await gateDoor();
  if (door.is_bind_hub === false) throw new Error("UniFi cannot remotely open this gate because it is not connected to a hub.");
  const personLink = database.select({ controllerUserId: unifiPersonLinks.controllerUserId })
    .from(unifiPersonLinks).where(eq(unifiPersonLinks.userId, actor.id)).get();

  await request<"success">(`/doors/${encodeURIComponent(door.id)}/unlock?control_cmd=open`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actor_id: personLink?.controllerUserId || actor.id,
      actor_name: actor.name.slice(0, 120),
      extra: { source: actor.source || "gatey", ...(actor.extra || {}) },
    }),
  });

  return cacheGateStatus(gateStatus(await gateDoor()));
}

export async function holdGateOpenUntil(endsAt: Date) {
  assertControllerChangesAllowed();
  const minutes = Math.ceil((endsAt.getTime() - Date.now()) / 60_000);
  if (minutes < 1) throw new Error("Choose a party end time at least one minute from now.");

  const door = await gateDoor();
  await request<"success">(`/doors/${encodeURIComponent(door.id)}/lock_rule`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "custom", interval: minutes }),
  });
  globalForGateStatus.gateyGateStatus = undefined;
}

export async function endGateHoldOpen() {
  assertControllerChangesAllowed();
  const door = await gateDoor();
  await request<"success">(`/doors/${encodeURIComponent(door.id)}/lock_rule`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "lock_now" }),
  });
  globalForGateStatus.gateyGateStatus = undefined;
}

function allDaySchedule() {
  return Object.fromEntries(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map((day) => [day, [{ start_time: "00:00:00", end_time: "23:59:59" }]]));
}

export async function generateGateCodePin(): Promise<string> {
  assertControllerChangesAllowed();
  return request<string>("/credentials/pin_codes", { method: "POST" });
}

async function createGateCodeVisitor(input: { householdName: string; label: string; startsAt: Date; endsAt: Date }): Promise<string> {
  const door = await gateDoor();
  const visitor = await request<{ id: string }>("/visitors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      first_name: "Gatey",
      last_name: `${input.householdName} — ${input.label}`.slice(0, 80),
      remarks: `Managed by Gatey for ${input.householdName}. Change this code in Gatey.`.slice(0, 255),
      start_time: Math.floor(input.startsAt.getTime() / 1_000),
      end_time: Math.floor(input.endsAt.getTime() / 1_000),
      visit_reason: "Others",
      week_schedule: allDaySchedule(),
      resources: [{ id: door.id, type: "door" }],
    }),
  });
  return visitor.id;
}

async function assignVisitorPin(visitorId: string, pin: string) {
  await request<null>(`/visitors/${encodeURIComponent(visitorId)}/pin_codes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin_code: pin }),
  });
}

async function removeVisitorPin(visitorId: string) {
  await request<null>(`/visitors/${encodeURIComponent(visitorId)}/pin_codes`, { method: "DELETE" });
}

export async function provisionGateCode(input: { householdName: string; label: string; pin: string; startsAt: Date; endsAt: Date }): Promise<{ visitorId: string }> {
  assertControllerChangesAllowed();
  const visitorId = await createGateCodeVisitor(input);

  try {
    await assignVisitorPin(visitorId, input.pin);
    return { visitorId };
  } catch (error) {
    await removeVisitorPin(visitorId).catch(() => undefined);
    await request<null>(`/visitors/${encodeURIComponent(visitorId)}`, { method: "DELETE" }).catch(() => undefined);
    throw error;
  }
}

export async function provisionAndPersistGateCode<T>(
  input: { householdName: string; label: string; pin: string; startsAt: Date; endsAt: Date },
  persist: (visitorId: string) => T,
): Promise<{ visitorId: string; persisted: T }> {
  const { visitorId } = await provisionGateCode(input);
  try {
    return { visitorId, persisted: persist(visitorId) };
  } catch (error) {
    try {
      await removeVisitorPin(visitorId);
      await request<null>(`/visitors/${encodeURIComponent(visitorId)}`, { method: "DELETE" });
    } catch (cleanupError) {
      throw new Error(`Gatey could not save the new code or remove its UniFi visitor: ${cleanupError instanceof Error ? cleanupError.message : "Unknown cleanup error"}`, { cause: error });
    }
    throw error;
  }
}

export async function migrateVisitorGateCode<T>(
  input: { oldVisitorId: string; householdName: string; label: string; pin: string; startsAt: Date; endsAt: Date },
  persist: (visitorId: string) => T,
): Promise<{ visitorId: string; persisted: T }> {
  assertControllerChangesAllowed();

  // UniFi leaves a cancelled visitor's globally unique PIN attached. Prepare
  // the replacement first, then move the PIN explicitly and restore it if the
  // controller handoff or local database transaction fails.
  const visitorId = await createGateCodeVisitor(input);
  let oldPinRemoved = false;

  try {
    await removeVisitorPin(input.oldVisitorId);
    oldPinRemoved = true;
    await assignVisitorPin(visitorId, input.pin);
    const persisted = persist(visitorId);

    // The replacement is usable and durable now. A cleanup failure must not
    // roll back the working Gatey code or tell the administrator to retry it.
    await revokeCredential(input.oldVisitorId).catch((error) => {
      console.error("UniFi could not archive the migrated visitor", { oldVisitorId: input.oldVisitorId, error });
    });
    return { visitorId, persisted };
  } catch (error) {
    // Revoking a visitor does not release its PIN, so detach the replacement
    // PIN before cancelling it and restoring the original visitor.
    await removeVisitorPin(visitorId).catch(() => undefined);
    await request<null>(`/visitors/${encodeURIComponent(visitorId)}`, { method: "DELETE" }).catch(() => undefined);
    if (oldPinRemoved) {
      try {
        await assignVisitorPin(input.oldVisitorId, input.pin);
      } catch (restoreError) {
        throw new Error(`Migration failed and UniFi could not restore the original PIN: ${restoreError instanceof Error ? restoreError.message : "Unknown error"}`, { cause: error });
      }
    }
    throw error;
  }
}

export async function revokeCredential(visitorId: string) {
  assertControllerChangesAllowed();
  await request<null>(`/visitors/${encodeURIComponent(visitorId)}`, { method: "DELETE" });
}

export async function getCredentialLastUse(visitorId: string, startsAt: string, endsAt: string): Promise<string | undefined> {
  const cached = globalForGateStatus.gateyCredentialLastUses?.get(visitorId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return undefined;

  const logs = await request<{ hits?: UnifiSystemLog[] }>("/system/logs?page_num=1&page_size=100", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: "door_openings",
      since: Math.floor(start.getTime() / 1_000),
      until: Math.floor(Math.min(end.getTime(), Date.now()) / 1_000),
      actor_id: visitorId,
    }),
  });

  // Denied attempts are intentionally not presented as a use of the code.
  const hit = logs.hits?.find((item) => !["BLOCKED", "DENIED", "FAILED"].includes(String(item._source?.event?.result || "").toUpperCase()));
  const value = timestampToIso(hit?._source?.event?.published);
  const cache = globalForGateStatus.gateyCredentialLastUses ?? new Map<string, { value: string | undefined; expiresAt: number }>();
  cache.set(visitorId, { value, expiresAt: Date.now() + CREDENTIAL_LAST_USE_TTL_MS });
  globalForGateStatus.gateyCredentialLastUses = cache;
  return value;
}

export async function listVisitorInventory(): Promise<VisitorInventoryItem[]> {
  const visitors = await request<UnifiVisitor[]>("/visitors");
  return visitors.map((visitor) => {
    const startsAt = timestampToIso(visitor.start_time);
    const endsAt = timestampToIso(visitor.end_time);
    return {
      id: visitor.id,
      name: [visitor.first_name, visitor.last_name].filter(Boolean).join(" ") || "Unnamed visitor",
      status: visitor.status || "UNKNOWN",
      ...(startsAt ? { startsAt } : {}),
      ...(endsAt ? { endsAt } : {}),
      hasPin: Boolean(visitor.pin_code),
      recurring: Boolean(visitor.schedule),
      resources: (visitor.resources || []).map((resource) => resource.name || resource.type || "Unnamed location"),
    };
  }).sort((left, right) => (right.endsAt || "").localeCompare(left.endsAt || ""));
}

export async function listUserInventory(): Promise<UserInventoryItem[]> {
  const users = await request<UnifiUser[]>("/users?page_num=1&page_size=100&expand[]=access_policy");
  return users.map((user) => ({
    id: user.id,
    name: user.full_name || user.alias || [user.first_name, user.last_name].filter(Boolean).join(" ") || "Unnamed person",
    status: user.status || "UNKNOWN",
    hasPin: Boolean(user.pin_code?.token),
    policyNames: (user.access_policies || []).map((policy) => policy.name || "Unnamed policy"),
    hasNfcCard: Boolean(user.nfc_cards?.length),
  })).sort((left, right) => left.name.localeCompare(right.name));
}

export async function replaceUserPin(userId: string, requestedPin?: string): Promise<string> {
  assertControllerChangesAllowed();
  if (requestedPin) {
    await request<null>(`/users/${encodeURIComponent(userId)}/pin_codes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin_code: requestedPin }),
    });
    return requestedPin;
  }

  const pin = await request<string>("/credentials/pin_codes", { method: "POST" });
  await request<null>(`/users/${encodeURIComponent(userId)}/pin_codes`, { method: "DELETE" });
  try {
    await request<null>(`/users/${encodeURIComponent(userId)}/pin_codes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin_code: pin }),
    });
  } catch (error) {
    throw new Error(`The old PIN was removed, but UniFi could not assign the new PIN: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
  return pin;
}

export async function replaceVisitorPin(visitorId: string, requestedPin?: string): Promise<string> {
  assertControllerChangesAllowed();
  if (requestedPin) {
    await request<null>(`/visitors/${encodeURIComponent(visitorId)}/pin_codes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin_code: requestedPin }),
    });
    return requestedPin;
  }

  const pin = await request<string>("/credentials/pin_codes", { method: "POST" });
  await request<null>(`/visitors/${encodeURIComponent(visitorId)}/pin_codes`, { method: "DELETE" });
  try {
    await request<null>(`/visitors/${encodeURIComponent(visitorId)}/pin_codes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin_code: pin }),
    });
  } catch (error) {
    throw new Error(`The old PIN was removed, but UniFi could not assign the new PIN: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
  return pin;
}
