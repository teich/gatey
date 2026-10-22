import "server-only";

import { eq } from "drizzle-orm";
import { database } from "@/lib/database";
import { unifiPersonLinks } from "@/lib/schema";
import { assertControllerChangesAllowed, jsonBody, request, unifiConfig } from "./client";

type Door = {
  id: string;
  name: string;
  type: string;
  is_bind_hub?: boolean;
  door_lock_relay_status?: string | null;
  door_position_status?: string | null;
};

export type ConfiguredGateIdentity = {
  id: string;
  name: string;
};

export type GateStatus = {
  state: "closed" | "opening" | "open" | "unknown";
  position: string | null;
  relay: string | null;
};

const GATE_STATUS_TTL_MS = 5_000;
// The gate's controller ID changes only if the door is re-created in UniFi, so
// actions reuse it rather than listing every door before each request.
const GATE_DOOR_TTL_MS = 10 * 60_000;

const globalForDoors = globalThis as unknown as {
  gateyGateStatus?: { value: GateStatus; expiresAt: number };
  gateyGateStatusPromise?: Promise<GateStatus>;
  gateyGateDoor?: { value: Door; expiresAt: number };
};

function cacheGateStatus(value: GateStatus) {
  globalForDoors.gateyGateStatus = { value, expiresAt: Date.now() + GATE_STATUS_TTL_MS };
  return value;
}

export function forgetGateDoor() {
  delete globalForDoors.gateyGateDoor;
  delete globalForDoors.gateyGateStatus;
}

async function fetchGateDoor(): Promise<Door> {
  const { doorName } = unifiConfig();
  const doors = await request<Door[]>("/doors");
  const door = doors.find((item) => item.name.trim().toLowerCase() === doorName.toLowerCase());
  if (!door) throw new Error(`UniFi could not find the '${doorName}' gate.`);
  globalForDoors.gateyGateDoor = { value: door, expiresAt: Date.now() + GATE_DOOR_TTL_MS };
  return door;
}

export async function gateDoor(): Promise<Door> {
  const cached = globalForDoors.gateyGateDoor;
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  return fetchGateDoor();
}

// Runs a door action with the cached ID. A failure may mean the door was
// re-created, so the next action looks it up again; the failed action itself is
// never retried because the controller may already have accepted it.
async function withGateDoor<T>(action: (door: Door) => Promise<T>): Promise<T> {
  const door = await gateDoor();
  try {
    return await action(door);
  } catch (error) {
    forgetGateDoor();
    throw error;
  }
}

export async function getConfiguredGateIdentity(): Promise<ConfiguredGateIdentity> {
  const door = await gateDoor();
  return { id: door.id, name: door.name };
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
  const cached = globalForDoors.gateyGateStatus;
  if (!options.fresh && cached && cached.expiresAt > Date.now()) return cached.value;

  const existing = globalForDoors.gateyGateStatusPromise;
  if (existing) return existing;

  // Status always reads the live door list, which also refreshes the cached door.
  const statusRequest = fetchGateDoor()
    .then(gateStatus)
    .then(cacheGateStatus)
    .finally(() => {
      delete globalForDoors.gateyGateStatusPromise;
    });
  globalForDoors.gateyGateStatusPromise = statusRequest;
  return statusRequest;
}

export async function unlockGate(actor: {
  id: string;
  name: string;
  source?: "gatey" | "twilio-voice";
  extra?: Record<string, string>;
}): Promise<GateStatus> {
  const personLink = database
    .select({ controllerUserId: unifiPersonLinks.controllerUserId })
    .from(unifiPersonLinks)
    .where(eq(unifiPersonLinks.userId, actor.id))
    .get();

  await withGateDoor(async (door) => {
    if (door.is_bind_hub === false)
      throw new Error("UniFi cannot remotely open this gate because it is not connected to a hub.");
    await request<"success">(`/doors/${encodeURIComponent(door.id)}/unlock?control_cmd=open`, {
      method: "PUT",
      ...jsonBody({
        actor_id: personLink?.controllerUserId || actor.id,
        actor_name: actor.name.slice(0, 120),
        extra: { source: actor.source || "gatey", ...(actor.extra || {}) },
      }),
    });
  });

  // Read past any status request already in flight; it predates the unlock.
  return cacheGateStatus(gateStatus(await fetchGateDoor()));
}

export async function holdGateOpenUntil(endsAt: Date) {
  assertControllerChangesAllowed();
  const minutes = Math.ceil((endsAt.getTime() - Date.now()) / 60_000);
  if (minutes < 1) throw new Error("Choose a party end time at least one minute from now.");

  await withGateDoor((door) =>
    request<"success">(`/doors/${encodeURIComponent(door.id)}/lock_rule`, {
      method: "PUT",
      ...jsonBody({ type: "custom", interval: minutes }),
    }),
  );
  delete globalForDoors.gateyGateStatus;
}

export async function endGateHoldOpen() {
  assertControllerChangesAllowed();
  await withGateDoor((door) =>
    request<"success">(`/doors/${encodeURIComponent(door.id)}/lock_rule`, {
      method: "PUT",
      ...jsonBody({ type: "lock_now" }),
    }),
  );
  delete globalForDoors.gateyGateStatus;
}
