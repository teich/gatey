import { authorizeAdminRequest } from "@/lib/api-authorization";
import { getPersonLink } from "@/lib/admin-assignments";
import { auth } from "@/lib/auth";
import { buildWelcomeMessage, createTemporaryPassword } from "@/lib/welcome-message";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/admin/people/[id]/reset-password">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;

  const { id } = await context.params;
  const person = getPersonLink(id);
  if (!person?.householdId || !person.householdName) {
    return Response.json({ error: "Assign this person to a household before resetting their password." }, { status: 409 });
  }

  try {
    const password = createTemporaryPassword();
    await auth.api.setUserPassword({
      body: { userId: person.userId, newPassword: password },
      headers: request.headers,
    });

    return Response.json({
      welcomeMessage: buildWelcomeMessage({
        householdName: person.householdName,
        name: person.accountName,
        email: person.email,
        username: person.username || person.email || person.accountName,
        password,
      }),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not reset this password." }, { status: 400 });
  }
}
