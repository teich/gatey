import { disableGateCode, findGateCode, hasGateCodePin, updateGateCode } from "@/lib/gate-codes";
import { replaceVisitorPin, revokeCredential } from "@/lib/unifi-access";
import { authorizeHouseholdRequest } from "@/lib/api-authorization";
import { recordAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext<"/api/gate-codes/[id]">) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;
  const { id } = await context.params;
  const householdId = authorization.context.household.id;
  const code = findGateCode(householdId, id);
  if (!code || code.state !== "active") return Response.json({ error: "Gate code not found." }, { status: 404 });

  try {
    const body = await request.json() as { label?: unknown; pin?: unknown };
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) : undefined;
    const pin = typeof body.pin === "string" ? body.pin.trim() : undefined;
    if (label !== undefined && !label) return Response.json({ error: "Enter a name for this code." }, { status: 400 });
    if (pin !== undefined && !/^\d{4,6}$/.test(pin)) return Response.json({ error: "Use a 4 to 6 digit gate code." }, { status: 400 });
    if (pin && hasGateCodePin(pin, id)) return Response.json({ error: "This code is already used by another Gatey code." }, { status: 409 });
    if (pin && pin !== code.pin) await replaceVisitorPin(code.controllerVisitorId, pin);
    const updated = updateGateCode({ householdId, id, label, pin });
    return Response.json({ code: updated });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update this gate code." }, { status: 424 });
  }
}

export async function DELETE(request: Request, context: RouteContext<"/api/gate-codes/[id]">) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;
  const { id } = await context.params;
  const householdId = authorization.context.household.id;
  const code = findGateCode(householdId, id);
  if (!code || code.state !== "active") return Response.json({ error: "Gate code not found." }, { status: 404 });
  try {
    await revokeCredential(code.controllerVisitorId);
    disableGateCode(householdId, id);
    try {
      const { user } = authorization.context.session;
      recordAuditEvent({ actorUserId: user.id, actorName: user.name || "Gatey resident", householdId, householdName: authorization.context.household.name, action: "gate-code.disabled", outcome: "succeeded", details: { label: code.label, kind: code.kind } });
    } catch { /* The controller action has already succeeded. */ }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not disable this gate code." }, { status: 424 });
  }
}
