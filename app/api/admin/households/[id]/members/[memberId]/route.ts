import { auth } from "@/lib/auth";
import { authorizeAdminRequest } from "@/lib/api-authorization";
import { getHouseholdMember } from "@/lib/households";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: RouteContext<"/api/admin/households/[id]/members/[memberId]">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;

  const { id, memberId } = await context.params;
  const member = getHouseholdMember(id, memberId);
  if (!member) return Response.json({ error: "Household member not found." }, { status: 404 });
  if (member.role.split(",").includes("owner")) {
    return Response.json({ error: "Keep owners in place. Add another owner before changing household ownership." }, { status: 400 });
  }

  try {
    await auth.api.removeMember({
      body: {
        memberIdOrEmail: member.id,
        organizationId: id,
      },
      headers: request.headers,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not remove the household member." }, { status: 400 });
  }
}
