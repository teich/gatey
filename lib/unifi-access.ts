import "server-only";

import { randomUUID } from "node:crypto";
import type { Credential } from "@/lib/credentials";

type ApiResponse<T> = { code?: string; data?: T; msg?: string; message?: string };
type Door = { id: string; name: string; type: string };

function config() {
  const host = process.env.UNIFI_HOST;
  const token = process.env.UNIFI_ACCESS_API_TOKEN;
  if (!host || !token) throw new Error("Gatey is missing its UniFi connection settings.");
  if (["1", "true", "yes"].includes((process.env.UNIFI_INSECURE_TLS || "").toLowerCase())) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
  return {
    baseUrl: `https://${host}:${process.env.UNIFI_ACCESS_PORT || "12445"}/api/v1/developer`,
    token,
    doorName: (process.env.UNIFI_DOOR_NAME || "Gate").trim(),
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { baseUrl, token } = config();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init.headers || {}) },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as ApiResponse<T>;
  if (!response.ok || !["SUCCESS", "OK"].includes(String(body.code || "").toUpperCase())) {
    throw new Error(body.msg || body.message || body.code || `UniFi request failed (${response.status})`);
  }
  return body.data as T;
}

async function gateDoor(): Promise<Door> {
  const { doorName } = config();
  const groups = await request<Array<{ resource_topologies?: Array<{ resources?: Door[] }> }>>("/door_groups/topology");
  const doors = groups.flatMap((group) => group.resource_topologies?.flatMap((floor) => floor.resources || []) || []);
  const door = doors.find((item) => item.name.trim().toLowerCase() === doorName.toLowerCase());
  if (!door) throw new Error(`UniFi could not find the '${doorName}' gate.`);
  return door;
}

function allDaySchedule() {
  return Object.fromEntries(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map((day) => [day, [{ start_time: "00:00:00", end_time: "23:59:59" }]]));
}

export async function provisionCredential(input: { label: string; startsAt: Date; endsAt: Date }): Promise<{ credential: Credential; visitorId: string }> {
  const door = await gateDoor();
  const visitor = await request<{ id: string }>("/visitors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      first_name: input.label.slice(0, 80),
      last_name: "Guest",
      remarks: "Created by Gatey",
      start_time: Math.floor(input.startsAt.getTime() / 1000),
      end_time: Math.floor(input.endsAt.getTime() / 1000),
      visit_reason: "Others",
      week_schedule: allDaySchedule(),
      resources: [{ id: door.id, type: "door" }],
    }),
  });

  try {
    const pin = await request<string>("/credentials/pin_codes", { method: "POST" });
    await request<null>(`/visitors/${encodeURIComponent(visitor.id)}/pin_codes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin_code: pin }),
    });
    return {
      visitorId: visitor.id,
      credential: {
        id: randomUUID(),
        label: input.label,
        pin,
        startsAt: input.startsAt.toISOString(),
        endsAt: input.endsAt.toISOString(),
        state: input.startsAt > new Date() ? "upcoming" : "active",
      },
    };
  } catch (error) {
    await request<null>(`/visitors/${encodeURIComponent(visitor.id)}`, { method: "DELETE" }).catch(() => undefined);
    throw error;
  }
}

export async function revokeCredential(visitorId: string) {
  await request<null>(`/visitors/${encodeURIComponent(visitorId)}`, { method: "DELETE" });
}
