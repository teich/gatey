import { hasGateCodePin, hasHomeCode, listGateCodes, saveGateCode, type GateCodeKind } from "@/lib/gate-codes";
import { generateGateCodePin, getCredentialLastUse, provisionGateCode } from "@/lib/unifi-access";
import { authorizeHouseholdRequest } from "@/lib/api-authorization";
import { recordAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONGOING_CONTROLLER_END = "2040-01-01T00:00:00.000Z";

type Usage = { lastUsedAt?: string; lastUseKnown: boolean };

function validKind(value: unknown): value is GateCodeKind {
  return value === "home" || value === "ongoing" || value === "temporary";
}

export async function GET(request: Request) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;
  const codes = listGateCodes(authorization.context.household.id);
  const usage = new Map<string, Usage>(await Promise.all(codes.map(async (code): Promise<[string, Usage]> => {
    try {
      return [code.id, { lastUsedAt: await getCredentialLastUse(code.controllerVisitorId, code.startsAt, code.controllerEndsAt), lastUseKnown: true }];
    } catch {
      return [code.id, { lastUseKnown: false }];
    }
  })));
  return Response.json({ codes: codes.map((code) => ({ ...code, ...usage.get(code.id) })) });
}

export async function POST(request: Request) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;

  try {
    const body = await request.json() as { label?: unknown; pin?: unknown; kind?: unknown; startsAt?: unknown; endsAt?: unknown };
    const kind = body.kind;
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) : "";
    const requestedPin = typeof body.pin === "string" ? body.pin.trim() : "";
    const startsAt = new Date(typeof body.startsAt === "string" ? body.startsAt : Date.now());
    const endsAt = kind === "temporary" ? new Date(String(body.endsAt)) : new Date(ONGOING_CONTROLLER_END);
    const householdId = authorization.context.household.id;

    if (!validKind(kind) || !label) return Response.json({ error: "Choose a name and type for this code." }, { status: 400 });
    if (requestedPin && !/^\d{4,6}$/.test(requestedPin)) return Response.json({ error: "Use a 4 to 6 digit gate code." }, { status: 400 });
    if (!requestedPin && kind !== "temporary") return Response.json({ error: "Choose a 4 to 6 digit gate code." }, { status: 400 });
    const pin = requestedPin || await generateGateCodePin();
    if (hasGateCodePin(pin)) return Response.json({ error: "This code is already used by another Gatey code." }, { status: 409 });
    if (kind === "home" && hasHomeCode(householdId)) return Response.json({ error: "Your household already has a home code." }, { status: 409 });
    if (Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf()) || endsAt <= startsAt) return Response.json({ error: "Choose a valid time for this code." }, { status: 400 });

    const { visitorId } = await provisionGateCode({ label, pin, startsAt, endsAt });
    const id = saveGateCode({ householdId, label, pin, kind, startsAt: startsAt.toISOString(), ...(kind === "temporary" ? { endsAt: endsAt.toISOString() } : {}), controllerEndsAt: endsAt.toISOString(), controllerVisitorId: visitorId });
    const code = listGateCodes(householdId).find((item) => item.id === id)!;
    try {
      const { user } = authorization.context.session;
      recordAuditEvent({ actorUserId: user.id, actorName: user.name || "Gatey resident", householdId, householdName: authorization.context.household.name, action: "gate-code.created", outcome: "succeeded", details: { label, kind } });
    } catch { /* The controller action has already succeeded. */ }
    return Response.json({ code }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create this gate code." }, { status: 502 });
  }
}
