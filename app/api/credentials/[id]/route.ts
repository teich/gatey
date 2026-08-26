import { getControllerVisitorId, markRevoked } from "@/lib/db";
import { revokeCredential } from "@/lib/unifi-access";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: RouteContext<"/api/credentials/[id]">) {
  const { id } = await context.params;
  const visitorId = getControllerVisitorId(id);
  if (!visitorId) return Response.json({ error: "Guest code not found." }, { status: 404 });
  try {
    await revokeCredential(visitorId);
    markRevoked(id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not cancel the guest code." }, { status: 502 });
  }
}
