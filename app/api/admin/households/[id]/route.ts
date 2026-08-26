import { BOOTSTRAP_HOUSEHOLD_ID } from "@/lib/auth";
import { authorizeAdminRequest } from "@/lib/api-authorization";
import { deleteHousehold, getHousehold, householdHasGateyRecords, updateHousehold } from "@/lib/households";

export const runtime = "nodejs";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function cleanText(value: unknown, field: string, maximum: number) {
  if (typeof value !== "string") throw new Error(`${field} is required.`);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maximum) throw new Error(`${field} must be between 1 and ${maximum} characters.`);
  return cleaned;
}

export async function PATCH(request: Request, context: RouteContext<"/api/admin/households/[id]">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;

  const { id } = await context.params;
  if (!getHousehold(id)) return Response.json({ error: "Household not found." }, { status: 404 });

  try {
    const body = await request.json() as { name?: unknown; slug?: unknown };
    const name = cleanText(body.name, "Household name", 80);
    const slug = cleanText(body.slug, "Slug", 64).toLowerCase();
    const household = updateHousehold(id, { name, slug });
    return Response.json({ household });
  } catch (error) {
    return Response.json({ error: errorMessage(error, "Could not update the household.") }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: RouteContext<"/api/admin/households/[id]">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;

  const { id } = await context.params;
  if (id === BOOTSTRAP_HOUSEHOLD_ID) {
    return Response.json({ error: "The initial Gatey household cannot be deleted." }, { status: 400 });
  }

  const household = getHousehold(id);
  if (!household) return Response.json({ error: "Household not found." }, { status: 404 });
  if (household.members.length > 0) {
    return Response.json({ error: "Remove the household's residents before deleting it." }, { status: 400 });
  }
  if (householdHasGateyRecords(id)) {
    return Response.json({ error: "This household has Gatey records and cannot be deleted." }, { status: 400 });
  }

  try {
    deleteHousehold(id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error, "Could not delete the household.") }, { status: 400 });
  }
}
