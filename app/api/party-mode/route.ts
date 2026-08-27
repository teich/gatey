import { authorizeHouseholdRequest } from "@/lib/api-authorization";
import { recordAuditEvent } from "@/lib/audit-log";
import { endPartyMode, getPartyMode, PartyModeConflictError, PartyModeValidationError, schedulePartyMode } from "@/lib/party-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };

function errorStatus(error: unknown) {
  return error instanceof PartyModeConflictError ? 409 : error instanceof PartyModeValidationError ? 400 : 503;
}

function messageFor(error: unknown, fallback: string) {
  return error instanceof PartyModeConflictError || error instanceof PartyModeValidationError ? error.message : fallback;
}

export async function GET(request: Request) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;

  try {
    const party = await getPartyMode();
    return Response.json({ party, canEnd: party ? party.householdId === authorization.context.household.id || authorization.context.isSystemAdmin : false }, { headers: noStoreHeaders });
  } catch {
    return Response.json({ error: "Party mode is unavailable." }, { status: 503, headers: noStoreHeaders });
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
  } as const;
  let startsAt: Date | undefined;
  let endsAt: Date | undefined;

  try {
    const body = await request.json() as { startsAt?: unknown; endsAt?: unknown };
    startsAt = new Date(String(body.startsAt));
    endsAt = new Date(String(body.endsAt));
    if (Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf())) throw new PartyModeValidationError("Choose a valid start and end time.");
    const party = await schedulePartyMode({
      startsAt,
      endsAt,
      householdId: auditInput.householdId,
      householdName: auditInput.householdName,
      actorUserId: auditInput.actorUserId,
      actorName: auditInput.actorName,
    });
    try {
      recordAuditEvent({
        ...auditInput,
        action: party?.state === "scheduled" ? "party.scheduled" : "party.enabled",
        outcome: "succeeded",
        details: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
      });
    } catch { /* Preserve the actual party-mode result if local logging is unavailable. */ }
    return Response.json({ party, canEnd: true }, { headers: noStoreHeaders });
  } catch (error) {
    try {
      recordAuditEvent({
        ...auditInput,
        action: startsAt && startsAt > new Date() ? "party.scheduled" : "party.enabled",
        outcome: "failed",
        details: {
          ...(startsAt && !Number.isNaN(startsAt.valueOf()) ? { startsAt: startsAt.toISOString() } : {}),
          ...(endsAt && !Number.isNaN(endsAt.valueOf()) ? { endsAt: endsAt.toISOString() } : {}),
        },
      });
    } catch { /* Preserve the actual party-mode result if local logging is unavailable. */ }
    return Response.json({ error: messageFor(error, "Party mode could not be enabled. Try again.") }, { status: errorStatus(error), headers: noStoreHeaders });
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;

  const { user } = authorization.context.session;
  const auditInput = {
    actorUserId: user.id,
    actorName: user.name || "Gatey resident",
    householdId: authorization.context.household.id,
    householdName: authorization.context.household.name,
  } as const;

  try {
    const party = await endPartyMode({ householdId: auditInput.householdId, isSystemAdmin: authorization.context.isSystemAdmin });
    try { recordAuditEvent({ ...auditInput, action: party.state === "scheduled" ? "party.cancelled" : "party.ended", outcome: "succeeded", details: { startsAt: party.startsAt, endsAt: party.endsAt } }); } catch { /* Preserve the actual party-mode result if local logging is unavailable. */ }
    return Response.json({ party: null, canEnd: false }, { headers: noStoreHeaders });
  } catch (error) {
    try { recordAuditEvent({ ...auditInput, action: "party.ended", outcome: "failed", details: {} }); } catch { /* Preserve the actual party-mode result if local logging is unavailable. */ }
    return Response.json({ error: messageFor(error, "Party mode could not be ended. Try again.") }, { status: errorStatus(error), headers: noStoreHeaders });
  }
}
