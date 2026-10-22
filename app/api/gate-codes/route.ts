import { listGateCodes } from "@/lib/gate-codes";
import { createGateCode, GateCodeInputError, gateCodeErrorResponse, isGateCodeKind, parseGateCodePin } from "@/lib/gate-code-service";
import { authorizeHouseholdRequest } from "@/lib/api-authorization";
import { recordAuditEvent } from "@/lib/audit-log";
import { listGateCodeUsageSummaries } from "@/lib/access-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;
  const codes = listGateCodes(authorization.context.household.id);
  const usage = listGateCodeUsageSummaries(authorization.context.household.id);
  return Response.json({
    codes: codes.map((code) => {
      const summary = usage.get(code.id);
      return {
        ...code,
        useCount: summary?.useCount || 0,
        usageWindowDays: summary?.usageWindowDays || 90,
        weeklyUses: summary?.weeklyUses || [],
        lastUsedAt: summary?.lastUsedAt,
        lastUseKnown: summary?.known || false,
        usageCoverageStartsAt: summary?.coverageStartsAt,
      };
    }),
  });
}

export async function POST(request: Request) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;
  const { session: { user }, household } = authorization.context;
  const audit = { actorUserId: user.id, actorName: user.name || "Gatey resident", householdId: household.id, householdName: household.name };

  try {
    const body = await request.json() as { label?: unknown; pin?: unknown; kind?: unknown; startsAt?: unknown; endsAt?: unknown };
    const kind = body.kind;
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) : "";
    if (!isGateCodeKind(kind) || !label) throw new GateCodeInputError("Choose a name and type for this code.");
    const pin = parseGateCodePin(body.pin);
    if (!pin && kind !== "temporary") throw new GateCodeInputError("Choose a 4 to 6 digit gate code.");

    const code = await createGateCode({
      householdId: household.id,
      householdName: household.name,
      label,
      kind,
      pin,
      startsAt: new Date(typeof body.startsAt === "string" ? body.startsAt : Date.now()),
      ...(kind === "temporary" ? { endsAt: new Date(String(body.endsAt)) } : {}),
    });
    recordAuditEvent({ ...audit, action: "gate-code.created", outcome: "succeeded", details: { label, kind } });
    return Response.json({ code }, { status: 201 });
  } catch (error) {
    // Repeated conflicts would show someone probing for other households' codes.
    if (error instanceof GateCodeInputError && error.reason === "pin-unavailable") {
      recordAuditEvent({ ...audit, action: "gate-code.pin-unavailable", outcome: "failed", details: {} });
    }
    return gateCodeErrorResponse(error, "Could not create this gate code.");
  }
}
