import { authorizeAdminRequest } from "@/lib/api-authorization";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  disableGateCode,
  findHomeCode,
  hasGateCodePin,
  saveGateCode,
  updateGateCode,
} from "@/lib/gate-codes";
import { getHousehold } from "@/lib/households";
import {
  generateGateCodePin,
  provisionAndPersistGateCode,
  replaceVisitorPin,
  revokeCredential,
} from "@/lib/unifi-access";

export const runtime = "nodejs";

const ONGOING_CONTROLLER_END = "2040-01-01T00:00:00.000Z";
type AdminContext = NonNullable<Awaited<ReturnType<typeof authorizeAdminRequest>>["context"]>;

class InputError extends Error {}

function requestedPin(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4,6}$/.test(value.trim())) {
    throw new InputError("Use a 4 to 6 digit gate code.");
  }
  return value.trim();
}

function audit(input: {
  context: AdminContext;
  household: NonNullable<ReturnType<typeof getHousehold>>;
  action: string;
  outcome: "succeeded" | "failed";
}) {
  try {
    recordAuditEvent({
      actorUserId: input.context.session.user.id,
      actorName: input.context.session.user.name || "Gatey administrator",
      householdId: input.household.id,
      householdName: input.household.name,
      action: input.action,
      outcome: input.outcome,
      details: { kind: "home" },
    });
  } catch { /* The controller result is more important than audit persistence. */ }
}

export async function POST(request: Request, context: RouteContext<"/api/admin/households/[id]/gate-code">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;
  const { id: householdId } = await context.params;
  const household = getHousehold(householdId);
  if (!household) return Response.json({ error: "Household not found." }, { status: 404 });
  if (findHomeCode(householdId)) return Response.json({ error: "This household already has a gate code." }, { status: 409 });

  try {
    const body = await request.json() as { pin?: unknown };
    const manualPin = requestedPin(body.pin);
    const pin = manualPin || await generateGateCodePin();
    if (hasGateCodePin(pin)) return Response.json({ error: "This gate code is already used by another household." }, { status: 409 });
    const startsAt = new Date();
    const endsAt = new Date(ONGOING_CONTROLLER_END);
    const label = `${household.name} gate code`;
    const { persisted: codeId } = await provisionAndPersistGateCode(
      { householdName: household.name, label, pin, startsAt, endsAt },
      (visitorId) => saveGateCode({
        householdId,
        label,
        pin,
        kind: "home",
        startsAt: startsAt.toISOString(),
        controllerEndsAt: endsAt.toISOString(),
        controllerVisitorId: visitorId,
      }),
    );
    const code = findHomeCode(householdId);
    if (!code || code.id !== codeId) throw new Error("Gatey could not find the gate code after saving it.");
    audit({ context: authorization.context, household, action: "gate-code.created", outcome: "succeeded" });
    return Response.json({ code }, { status: 201 });
  } catch (error) {
    audit({ context: authorization.context, household, action: "gate-code.created", outcome: "failed" });
    return Response.json({ error: error instanceof Error ? error.message : "Could not create this gate code." }, { status: error instanceof InputError ? 400 : 424 });
  }
}

export async function PATCH(request: Request, context: RouteContext<"/api/admin/households/[id]/gate-code">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;
  const { id: householdId } = await context.params;
  const household = getHousehold(householdId);
  if (!household) return Response.json({ error: "Household not found." }, { status: 404 });
  const code = findHomeCode(householdId);
  if (!code) return Response.json({ error: "This household does not have a gate code." }, { status: 404 });

  try {
    const body = await request.json() as { pin?: unknown };
    const manualPin = requestedPin(body.pin);
    const pin = manualPin || await generateGateCodePin();
    if (hasGateCodePin(pin, code.id)) return Response.json({ error: "This gate code is already used by another household." }, { status: 409 });
    const changed = pin !== code.pin;
    if (changed) await replaceVisitorPin(code.controllerVisitorId, pin);
    let updated;
    try {
      updated = updateGateCode({ householdId, id: code.id, label: `${household.name} gate code`, pin });
      if (!updated) throw new Error("The gate code was removed while it was being updated.");
    } catch (persistenceError) {
      if (changed) {
        try {
          await replaceVisitorPin(code.controllerVisitorId, code.pin);
        } catch (restoreError) {
          throw new Error(`Gatey could not save the new PIN or restore the old UniFi PIN: ${restoreError instanceof Error ? restoreError.message : "Unknown restore error"}`, { cause: persistenceError });
        }
      }
      throw persistenceError;
    }
    audit({ context: authorization.context, household, action: "gate-code.updated", outcome: "succeeded" });
    return Response.json({ code: updated });
  } catch (error) {
    audit({ context: authorization.context, household, action: "gate-code.updated", outcome: "failed" });
    return Response.json({ error: error instanceof Error ? error.message : "Could not update this gate code." }, { status: error instanceof InputError ? 400 : 424 });
  }
}

export async function DELETE(request: Request, context: RouteContext<"/api/admin/households/[id]/gate-code">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;
  const { id: householdId } = await context.params;
  const household = getHousehold(householdId);
  if (!household) return Response.json({ error: "Household not found." }, { status: 404 });
  const code = findHomeCode(householdId);
  if (!code) return Response.json({ error: "This household does not have a gate code." }, { status: 404 });

  try {
    await revokeCredential(code.controllerVisitorId);
    disableGateCode(householdId, code.id);
    audit({ context: authorization.context, household, action: "gate-code.disabled", outcome: "succeeded" });
    return Response.json({ ok: true });
  } catch (error) {
    audit({ context: authorization.context, household, action: "gate-code.disabled", outcome: "failed" });
    return Response.json({ error: error instanceof Error ? error.message : "Could not remove this gate code." }, { status: 424 });
  }
}
