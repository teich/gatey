import "server-only";

import {
  findGateCode,
  hasGateCodePin,
  hasHomeCode,
  saveGateCode,
  updateGateCode,
  disableGateCode,
  type GateCode,
  type GateCodeKind,
} from "@/lib/gate-codes";
import {
  generateGateCodePin,
  migrateVisitorGateCode,
  provisionAndPersistGateCode,
  replaceVisitorPin,
  revokeCredential,
} from "@/lib/unifi-access";

// Gate codes live in two places: a UniFi visitor holds the PIN and Gatey's
// database holds ownership. These operations keep both in step, undoing the
// controller change when the local write fails.

export const ONGOING_CONTROLLER_END = "2040-01-01T00:00:00.000Z";

export class GateCodeInputError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
    readonly reason?: "pin-unavailable",
  ) {
    super(message);
  }
}

// UniFi PINs are unique across every household, so a conflict cannot be
// avoided; the message just avoids confirming that the PIN is someone's code.
const pinUnavailable = () =>
  new GateCodeInputError("This code can't be used. Choose a different one.", 409, "pin-unavailable");

export function isGateCodeKind(value: unknown): value is GateCodeKind {
  return value === "home" || value === "ongoing" || value === "temporary";
}

export function parseGateCodePin(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4,6}$/.test(value.trim()))
    throw new GateCodeInputError("Use a 4 to 6 digit gate code.");
  return value.trim();
}

export async function createGateCode(input: {
  householdId: string;
  householdName: string;
  label: string;
  kind: GateCodeKind;
  pin: string | null;
  startsAt: Date;
  endsAt?: Date;
}): Promise<GateCode> {
  const endsAt = input.kind === "temporary" && input.endsAt ? input.endsAt : new Date(ONGOING_CONTROLLER_END);
  if (Number.isNaN(input.startsAt.valueOf()) || Number.isNaN(endsAt.valueOf()) || endsAt <= input.startsAt) {
    throw new GateCodeInputError("Choose a valid time for this code.");
  }
  if (input.kind === "home" && hasHomeCode(input.householdId))
    throw new GateCodeInputError("This household already has a home code.", 409);
  const pin = input.pin || (await generateGateCodePin());
  if (hasGateCodePin(pin)) throw pinUnavailable();

  const { persisted: id } = await provisionAndPersistGateCode(
    { householdName: input.householdName, label: input.label, pin, startsAt: input.startsAt, endsAt },
    (visitorId) =>
      saveGateCode({
        householdId: input.householdId,
        label: input.label,
        pin,
        kind: input.kind,
        startsAt: input.startsAt.toISOString(),
        ...(input.kind === "temporary" ? { endsAt: endsAt.toISOString() } : {}),
        controllerEndsAt: endsAt.toISOString(),
        controllerVisitorId: visitorId,
      }),
  );
  const code = findGateCode(input.householdId, id);
  if (!code) throw new Error("Gatey could not find the gate code after saving it.");
  return code;
}

export async function changeGateCode(input: {
  householdId: string;
  code: GateCode;
  label?: string;
  pin?: string;
}): Promise<GateCode> {
  const { code } = input;
  if (input.pin && hasGateCodePin(input.pin, code.id)) throw pinUnavailable();
  const controllerPinChanged = Boolean(input.pin && input.pin !== code.pin);
  if (controllerPinChanged) await replaceVisitorPin(code.controllerVisitorId, input.pin);
  try {
    const updated = updateGateCode({ householdId: input.householdId, id: code.id, label: input.label, pin: input.pin });
    if (!updated) throw new Error("Gate code was removed while it was being updated.");
    return updated;
  } catch (persistenceError) {
    if (controllerPinChanged) {
      try {
        await replaceVisitorPin(code.controllerVisitorId, code.pin);
      } catch (restoreError) {
        throw new Error(
          `Gatey could not save the new PIN or restore the old UniFi PIN: ${restoreError instanceof Error ? restoreError.message : "Unknown restore error"}`,
          { cause: persistenceError },
        );
      }
    }
    throw persistenceError;
  }
}

export async function retireGateCode(householdId: string, code: GateCode) {
  await revokeCredential(code.controllerVisitorId);
  disableGateCode(householdId, code.id);
}

export async function adoptVisitorAsGateCode(input: {
  oldVisitorId: string;
  householdId: string;
  householdName: string;
  label: string;
  kind: GateCodeKind;
  pin: string;
}): Promise<string> {
  if (hasGateCodePin(input.pin)) throw new GateCodeInputError("That PIN is already managed by Gatey.", 409);
  if (input.kind === "home" && hasHomeCode(input.householdId))
    throw new GateCodeInputError("This household already has a home code.", 409);

  const startsAt = new Date();
  const endsAt = new Date(ONGOING_CONTROLLER_END);
  const { persisted } = await migrateVisitorGateCode(
    {
      oldVisitorId: input.oldVisitorId,
      householdName: input.householdName,
      label: input.label,
      pin: input.pin,
      startsAt,
      endsAt,
    },
    (visitorId) =>
      saveGateCode({
        householdId: input.householdId,
        label: input.label,
        pin: input.pin,
        kind: input.kind,
        startsAt: startsAt.toISOString(),
        controllerEndsAt: endsAt.toISOString(),
        controllerVisitorId: visitorId,
        legacyControllerVisitorIds: [input.oldVisitorId],
      }),
  );
  return persisted;
}

// Residents see only messages Gatey wrote; controller and database errors are
// logged for the administrator instead.
export function gateCodeErrorResponse(
  error: unknown,
  fallback: string,
  options: { showControllerErrors?: boolean } = {},
) {
  if (error instanceof GateCodeInputError) return Response.json({ error: error.message }, { status: error.status });
  console.error(fallback, error);
  const message = options.showControllerErrors && error instanceof Error ? error.message : fallback;
  return Response.json({ error: message }, { status: 424 });
}
