import "server-only";

import { assertControllerChangesAllowed, jsonBody, request, timestampToIso } from "./client";
import { gateDoor } from "./doors";

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

type GateCodeVisitorInput = { householdName: string; label: string; startsAt: Date; endsAt: Date };

const visitorPath = (visitorId: string) => `/visitors/${encodeURIComponent(visitorId)}`;

function allDaySchedule() {
  return Object.fromEntries(
    ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map((day) => [
      day,
      [{ start_time: "00:00:00", end_time: "23:59:59" }],
    ]),
  );
}

export async function generateGateCodePin(): Promise<string> {
  assertControllerChangesAllowed();
  return request<string>("/credentials/pin_codes", { method: "POST" });
}

// Replaces the PIN on a UniFi user or visitor. A requested PIN is set in place;
// a generated one requires removing the old PIN first, which leaves a window
// where the subject has no PIN if the assignment then fails.
export async function replaceSubjectPin(subjectPath: string, requestedPin?: string): Promise<string> {
  assertControllerChangesAllowed();
  if (requestedPin) {
    await request<null>(`${subjectPath}/pin_codes`, { method: "PUT", ...jsonBody({ pin_code: requestedPin }) });
    return requestedPin;
  }

  const pin = await generateGateCodePin();
  await request<null>(`${subjectPath}/pin_codes`, { method: "DELETE" });
  try {
    await request<null>(`${subjectPath}/pin_codes`, { method: "PUT", ...jsonBody({ pin_code: pin }) });
  } catch (error) {
    throw new Error(
      `The old PIN was removed, but UniFi could not assign the new PIN: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
  return pin;
}

async function createGateCodeVisitor(input: GateCodeVisitorInput): Promise<string> {
  const door = await gateDoor();
  const visitor = await request<{ id: string }>("/visitors", {
    method: "POST",
    ...jsonBody({
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
  await request<null>(`${visitorPath(visitorId)}/pin_codes`, { method: "PUT", ...jsonBody({ pin_code: pin }) });
}

async function removeVisitorPin(visitorId: string) {
  await request<null>(`${visitorPath(visitorId)}/pin_codes`, { method: "DELETE" });
}

// Revoking a visitor does not release its globally unique PIN, so the PIN is
// detached before the visitor is deleted.
async function discardVisitor(visitorId: string) {
  await removeVisitorPin(visitorId);
  await request<null>(visitorPath(visitorId), { method: "DELETE" });
}

export async function provisionGateCode(input: GateCodeVisitorInput & { pin: string }): Promise<{ visitorId: string }> {
  assertControllerChangesAllowed();
  const visitorId = await createGateCodeVisitor(input);

  try {
    await assignVisitorPin(visitorId, input.pin);
    return { visitorId };
  } catch (error) {
    await removeVisitorPin(visitorId).catch(() => undefined);
    await request<null>(visitorPath(visitorId), { method: "DELETE" }).catch(() => undefined);
    throw error;
  }
}

export async function provisionAndPersistGateCode<T>(
  input: GateCodeVisitorInput & { pin: string },
  persist: (visitorId: string) => T,
): Promise<{ visitorId: string; persisted: T }> {
  const { visitorId } = await provisionGateCode(input);
  try {
    return { visitorId, persisted: persist(visitorId) };
  } catch (error) {
    try {
      await discardVisitor(visitorId);
    } catch (cleanupError) {
      throw new Error(
        `Gatey could not save the new code or remove its UniFi visitor: ${cleanupError instanceof Error ? cleanupError.message : "Unknown cleanup error"}`,
        { cause: error },
      );
    }
    throw error;
  }
}

export async function migrateVisitorGateCode<T>(
  input: GateCodeVisitorInput & { oldVisitorId: string; pin: string },
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
    await removeVisitorPin(visitorId).catch(() => undefined);
    await request<null>(visitorPath(visitorId), { method: "DELETE" }).catch(() => undefined);
    if (oldPinRemoved) {
      try {
        await assignVisitorPin(input.oldVisitorId, input.pin);
      } catch (restoreError) {
        throw new Error(
          `Migration failed and UniFi could not restore the original PIN: ${restoreError instanceof Error ? restoreError.message : "Unknown error"}`,
          { cause: error },
        );
      }
    }
    throw error;
  }
}

export async function revokeCredential(visitorId: string) {
  assertControllerChangesAllowed();
  await request<null>(visitorPath(visitorId), { method: "DELETE" });
}

export async function replaceVisitorPin(visitorId: string, requestedPin?: string): Promise<string> {
  return replaceSubjectPin(visitorPath(visitorId), requestedPin);
}

export async function listVisitorInventory(): Promise<VisitorInventoryItem[]> {
  const visitors = await request<UnifiVisitor[]>("/visitors");
  return visitors
    .map((visitor) => {
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
    })
    .sort((left, right) => (right.endsAt || "").localeCompare(left.endsAt || ""));
}
