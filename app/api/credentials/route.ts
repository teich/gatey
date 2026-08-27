import { insertCredential, listCredentials } from "@/lib/db";
import { provisionCredential } from "@/lib/unifi-access";
import { authorizeHouseholdRequest } from "@/lib/api-authorization";
import { recordAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;
  return Response.json({ credentials: listCredentials(authorization.context.household.id) });
}

export async function POST(request: Request) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;

  try {
    const body = await request.json() as { label?: unknown; startsAt?: unknown; endsAt?: unknown };
    const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : "Guest";
    const startsAt = new Date(String(body.startsAt));
    const endsAt = new Date(String(body.endsAt));
    if (Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf()) || endsAt <= startsAt) {
      return Response.json({ error: "Choose a valid start and end time." }, { status: 400 });
    }
    const { credential, visitorId } = await provisionCredential({ label, startsAt, endsAt });
    insertCredential(authorization.context.household.id, credential, visitorId);
    try {
      const { user } = authorization.context.session;
      recordAuditEvent({
        actorUserId: user.id,
        actorName: user.name || "Gatey resident",
        householdId: authorization.context.household.id,
        householdName: authorization.context.household.name,
        action: "guest-code.created",
        outcome: "succeeded",
        details: { label: credential.label, startsAt: credential.startsAt, endsAt: credential.endsAt },
      });
    } catch { /* The guest code already exists; preserve that result if local logging is unavailable. */ }
    return Response.json({ credential }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create the guest code." }, { status: 502 });
  }
}
