import { authorizeHouseholdRequest } from "@/lib/api-authorization";
import { recordAuditEvent } from "@/lib/audit-log";
import { getGateStatus, unlockGate } from "@/lib/unifi-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };

export async function GET(request: Request) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;

  try {
    return Response.json(await getGateStatus(), { headers: noStoreHeaders });
  } catch {
    return Response.json({ error: "Gate status is unavailable." }, { status: 503, headers: noStoreHeaders });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;

  const { user } = authorization.context.session;
  const auditInput = {
    actorUserId: user.id,
    actorName: user.name || "Gatey resident",
    householdId: authorization.context.household.id,
    householdName: authorization.context.household.name,
    action: "gate.open",
  } as const;

  let status;
  try {
    status = await unlockGate({ id: user.id, name: user.name || "Gatey resident" });
  } catch {
    recordAuditEvent({ ...auditInput, outcome: "failed", details: {} });
    return Response.json({ error: "Gate could not be opened. Try again." }, { status: 503, headers: noStoreHeaders });
  }

  recordAuditEvent({
    ...auditInput,
    outcome: "succeeded",
    details: { state: status.state, position: status.position, relay: status.relay },
  });

  return Response.json(status, { headers: noStoreHeaders });
}
