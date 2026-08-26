import { getControllerVisitorId, markRevoked } from "@/lib/db";
import { revokeCredential } from "@/lib/unifi-access";
import { authorizeHouseholdRequest } from "@/lib/api-authorization";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: RouteContext<"/api/credentials/[id]">) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;

  const { id } = await context.params;
  const householdId = authorization.context.household.id;
  const visitorId = getControllerVisitorId(householdId, id);
  if (!visitorId) return Response.json({ error: "Guest code not found." }, { status: 404 });
  try {
    await revokeCredential(visitorId);
    markRevoked(householdId, id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not cancel the guest code." }, { status: 502 });
  }
}
