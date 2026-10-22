import { listHouseholds } from "@/lib/households";
import {
  adoptVisitorAsGateCode,
  GateCodeInputError,
  gateCodeErrorResponse,
  isGateCodeKind,
} from "@/lib/gate-code-service";
import { authorizeAdminRequest } from "@/lib/api-authorization";
import { recordAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/admin/visitors/[id]/migrate">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;
  const { id: oldVisitorId } = await context.params;

  try {
    const body = (await request.json()) as { householdId?: unknown; label?: unknown; pin?: unknown; kind?: unknown };
    const householdId = typeof body.householdId === "string" ? body.householdId : "";
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) : "";
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";
    const kind = body.kind;
    const household = listHouseholds().find((item) => item.id === householdId);
    if (!household || !isGateCodeKind(kind) || !label)
      throw new GateCodeInputError("Choose a household, name, and code type.");
    if (!/^\d{4,6}$/.test(pin)) throw new GateCodeInputError("Use the existing 4 to 6 digit code.");

    const codeId = await adoptVisitorAsGateCode({
      oldVisitorId,
      householdId,
      householdName: household.name,
      label,
      kind,
      pin,
    });
    const { user } = authorization.context.session;
    recordAuditEvent({
      actorUserId: user.id,
      actorName: user.name || "Gatey administrator",
      householdId,
      householdName: household.name,
      action: "gate-code.migrated",
      outcome: "succeeded",
      details: { label, kind },
    });
    return Response.json({ codeId });
  } catch (error) {
    return gateCodeErrorResponse(error, "Migration could not be completed.", { showControllerErrors: true });
  }
}
