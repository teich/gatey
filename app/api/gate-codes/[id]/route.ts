import { findGateCode } from "@/lib/gate-codes";
import { changeGateCode, GateCodeInputError, gateCodeErrorResponse, retireGateCode } from "@/lib/gate-code-service";
import { authorizeHouseholdRequest } from "@/lib/api-authorization";
import { recordAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext<"/api/gate-codes/[id]">) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;
  const { id } = await context.params;
  const { session: { user }, household } = authorization.context;
  const code = findGateCode(household.id, id);
  if (!code || code.state !== "active") return Response.json({ error: "Gate code not found." }, { status: 404 });
  const audit = { actorUserId: user.id, actorName: user.name || "Gatey resident", householdId: household.id, householdName: household.name };

  try {
    const body = await request.json() as { label?: unknown; pin?: unknown };
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) : undefined;
    const pin = typeof body.pin === "string" ? body.pin.trim() : undefined;
    if (label !== undefined && !label) throw new GateCodeInputError("Enter a name for this code.");
    if (pin !== undefined && !/^\d{4,6}$/.test(pin)) throw new GateCodeInputError("Use a 4 to 6 digit gate code.");
    const updated = await changeGateCode({ householdId: household.id, code, label, pin });
    recordAuditEvent({ ...audit, action: "gate-code.updated", outcome: "succeeded", details: { label: updated.label, kind: updated.kind } });
    return Response.json({ code: updated });
  } catch (error) {
    if (error instanceof GateCodeInputError && error.reason === "pin-unavailable") {
      recordAuditEvent({ ...audit, action: "gate-code.pin-unavailable", outcome: "failed", details: {} });
    }
    return gateCodeErrorResponse(error, "Could not update this gate code.");
  }
}

export async function DELETE(request: Request, context: RouteContext<"/api/gate-codes/[id]">) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;
  const { id } = await context.params;
  const { session: { user }, household } = authorization.context;
  const code = findGateCode(household.id, id);
  if (!code || code.state !== "active") return Response.json({ error: "Gate code not found." }, { status: 404 });
  try {
    await retireGateCode(household.id, code);
    recordAuditEvent({ actorUserId: user.id, actorName: user.name || "Gatey resident", householdId: household.id, householdName: household.name, action: "gate-code.disabled", outcome: "succeeded", details: { label: code.label, kind: code.kind } });
    return Response.json({ ok: true });
  } catch (error) {
    return gateCodeErrorResponse(error, "Could not disable this gate code.");
  }
}
