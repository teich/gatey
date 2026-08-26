import { authorizeAdminRequest } from "@/lib/api-authorization";
import { assignVisitorToHousehold } from "@/lib/admin-assignments";
import { listHouseholds } from "@/lib/households";
import { listVisitorInventory } from "@/lib/unifi-access";

export const runtime = "nodejs";

export async function PUT(request: Request, context: RouteContext<"/api/admin/visitors/[id]/assignment">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;

  try {
    const { id } = await context.params;
    const body = await request.json() as { householdId?: unknown };
    const householdId = typeof body.householdId === "string" ? body.householdId.trim() : "";
    if (!householdId) return Response.json({ error: "Choose a household." }, { status: 400 });
    const household = listHouseholds().find((item) => item.id === householdId);
    if (!household) return Response.json({ error: "Household not found." }, { status: 404 });
    const visitor = (await listVisitorInventory()).find((item) => item.id === id);
    if (!visitor) return Response.json({ error: "UniFi visitor not found." }, { status: 404 });

    assignVisitorToHousehold(id, householdId);
    return Response.json({ household: { id: household.id, name: household.name } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not assign this visitor." }, { status: 400 });
  }
}
