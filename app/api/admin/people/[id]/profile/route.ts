import { authorizeAdminRequest } from "@/lib/api-authorization";
import { auth } from "@/lib/auth";
import { getPersonLink, reassignPersonHousehold, validatePersonHouseholdReassignment } from "@/lib/admin-assignments";
import { listHouseholds } from "@/lib/households";
import { managedAccountEmail, optionalAccountEmail } from "@/lib/account-email";

export const runtime = "nodejs";

function cleanText(value: unknown, field: string, minimum: number, maximum: number) {
  if (typeof value !== "string") throw new Error(`${field} is required.`);
  const cleaned = value.trim();
  if (cleaned.length < minimum || cleaned.length > maximum) throw new Error(`${field} must be between ${minimum} and ${maximum} characters.`);
  return cleaned;
}

export async function PATCH(request: Request, context: RouteContext<"/api/admin/people/[id]/profile">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;

  try {
    const { id } = await context.params;
    const link = getPersonLink(id);
    if (!link) return Response.json({ error: "This UniFi person is not linked to a Gatey account." }, { status: 404 });

    const body = await request.json() as Record<string, unknown>;
    const name = cleanText(body.name, "Name", 1, 80);
    const contactEmail = optionalAccountEmail(body.email);
    const email = contactEmail || managedAccountEmail(link.username || link.userId);
    const householdId = cleanText(body.householdId, "Household", 1, 128);
    if (!listHouseholds().some((household) => household.id === householdId)) {
      return Response.json({ error: "Household not found." }, { status: 404 });
    }
    validatePersonHouseholdReassignment(link.userId, householdId);

    await auth.api.adminUpdateUser({
      body: { userId: link.userId, data: { name, email, emailVerified: Boolean(contactEmail) } },
      headers: request.headers,
    });
    reassignPersonHousehold(id, link.userId, householdId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update this person." }, { status: 400 });
  }
}
