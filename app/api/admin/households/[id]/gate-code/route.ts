import { authorizeAdminRequest } from "@/lib/api-authorization";
import { recordAuditEvent } from "@/lib/audit-log";
import { findHomeCode } from "@/lib/gate-codes";
import { changeGateCode, createGateCode, gateCodeErrorResponse, parseGateCodePin, retireGateCode } from "@/lib/gate-code-service";
import { getHousehold } from "@/lib/households";
import { generateGateCodePin } from "@/lib/unifi-access";

export const runtime = "nodejs";

type AdminContext = NonNullable<Awaited<ReturnType<typeof authorizeAdminRequest>>["context"]>;
type Household = NonNullable<ReturnType<typeof getHousehold>>;

function audit(context: AdminContext, household: Household, action: string, outcome: "succeeded" | "failed") {
  recordAuditEvent({
    actorUserId: context.session.user.id,
    actorName: context.session.user.name || "Gatey administrator",
    householdId: household.id,
    householdName: household.name,
    action,
    outcome,
    details: { kind: "home" },
  });
}

// Administrators need the controller's own error to fix a failed change.
const errorResponse = (error: unknown, fallback: string) => gateCodeErrorResponse(error, fallback, { showControllerErrors: true });

export async function POST(request: Request, context: RouteContext<"/api/admin/households/[id]/gate-code">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;
  const { id: householdId } = await context.params;
  const household = getHousehold(householdId);
  if (!household) return Response.json({ error: "Household not found." }, { status: 404 });
  if (findHomeCode(householdId)) return Response.json({ error: "This household already has a gate code." }, { status: 409 });

  try {
    const body = await request.json() as { pin?: unknown };
    const code = await createGateCode({
      householdId,
      householdName: household.name,
      label: `${household.name} gate code`,
      kind: "home",
      pin: parseGateCodePin(body.pin),
      startsAt: new Date(),
    });
    audit(authorization.context, household, "gate-code.created", "succeeded");
    return Response.json({ code }, { status: 201 });
  } catch (error) {
    audit(authorization.context, household, "gate-code.created", "failed");
    return errorResponse(error, "Could not create this gate code.");
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
    const pin = parseGateCodePin(body.pin) || await generateGateCodePin();
    const updated = await changeGateCode({ householdId, code, label: `${household.name} gate code`, pin });
    audit(authorization.context, household, "gate-code.updated", "succeeded");
    return Response.json({ code: updated });
  } catch (error) {
    audit(authorization.context, household, "gate-code.updated", "failed");
    return errorResponse(error, "Could not update this gate code.");
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
    await retireGateCode(householdId, code);
    audit(authorization.context, household, "gate-code.disabled", "succeeded");
    return Response.json({ ok: true });
  } catch (error) {
    audit(authorization.context, household, "gate-code.disabled", "failed");
    return errorResponse(error, "Could not remove this gate code.");
  }
}
