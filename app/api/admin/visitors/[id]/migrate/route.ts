import { listHouseholds } from "@/lib/households";
import { hasGateCodePin, hasHomeCode, saveGateCode, type GateCodeKind } from "@/lib/gate-codes";
import { provisionGateCode, revokeCredential } from "@/lib/unifi-access";
import { authorizeAdminRequest } from "@/lib/api-authorization";
import { recordAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

const ONGOING_CONTROLLER_END = "2040-01-01T00:00:00.000Z";

function validKind(value: unknown): value is GateCodeKind {
  return value === "home" || value === "ongoing" || value === "temporary";
}

export async function POST(request: Request, context: RouteContext<"/api/admin/visitors/[id]/migrate">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;
  const { id: oldVisitorId } = await context.params;

  try {
    const body = await request.json() as { householdId?: unknown; label?: unknown; pin?: unknown; kind?: unknown };
    const householdId = typeof body.householdId === "string" ? body.householdId : "";
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) : "";
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";
    const kind = body.kind;
    const household = listHouseholds().find((item) => item.id === householdId);
    if (!household || !validKind(kind) || !label) return Response.json({ error: "Choose a household, name, and code type." }, { status: 400 });
    if (!/^\d{4,6}$/.test(pin)) return Response.json({ error: "Use the existing 4 to 6 digit code." }, { status: 400 });
    if (hasGateCodePin(pin)) return Response.json({ error: "That PIN is already managed by Gatey." }, { status: 409 });
    if (kind === "home" && hasHomeCode(householdId)) return Response.json({ error: "This household already has a home code." }, { status: 409 });

    // UniFi PINs are globally unique. Removing the old visitor first creates a
    // short, intentional handoff window before Gatey creates the clean record.
    await revokeCredential(oldVisitorId);
    const startsAt = new Date();
    const endsAt = new Date(ONGOING_CONTROLLER_END);
    const { visitorId } = await provisionGateCode({ householdName: household.name, label, pin, startsAt, endsAt });
    const codeId = saveGateCode({ householdId, label, pin, kind, startsAt: startsAt.toISOString(), controllerEndsAt: endsAt.toISOString(), controllerVisitorId: visitorId });
    try {
      const { user } = authorization.context.session;
      recordAuditEvent({ actorUserId: user.id, actorName: user.name || "Gatey administrator", householdId, householdName: household.name, action: "gate-code.migrated", outcome: "succeeded", details: { label, kind } });
    } catch { /* The controller action has already succeeded. */ }
    return Response.json({ codeId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Migration could not be completed." }, { status: 502 });
  }
}
