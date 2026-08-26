import { saveVisitorPin } from "@/lib/db";
import { replaceVisitorPin } from "@/lib/unifi-access";
import { authorizeAdminRequest } from "@/lib/api-authorization";
import { getVisitorHousehold } from "@/lib/admin-assignments";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/visitors/[id]/replace-pin">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;

  const { id } = await context.params;
  try {
    const assignment = getVisitorHousehold(id);
    if (!assignment) return Response.json({ error: "Assign this visitor to a household before managing their PIN." }, { status: 409 });
    const body = await request.json() as { label?: unknown; pin?: unknown };
    const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 160) : "UniFi visitor";
    const requestedPin = typeof body.pin === "string" ? body.pin.trim() : undefined;
    if (requestedPin && !/^\d{4,8}$/.test(requestedPin)) {
      return Response.json({ error: "Use a 4 to 8 digit PIN." }, { status: 400 });
    }
    const pin = await replaceVisitorPin(id, requestedPin);
    saveVisitorPin({ householdId: assignment.householdId, visitorId: id, label, pin });
    return Response.json({ pin });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save the PIN." }, { status: 502 });
  }
}
