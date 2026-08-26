import { authorizeAdminRequest } from "@/lib/api-authorization";
import { auth } from "@/lib/auth";
import { assignPersonRecords, getPersonLink, linkUnifiPerson, listAssignableAccounts } from "@/lib/admin-assignments";
import { getUserByEmail, getUserHousehold, listHouseholds } from "@/lib/households";
import { listUserInventory } from "@/lib/unifi-access";
import { buildWelcomeMessage, createTemporaryPassword } from "@/lib/welcome-message";

export const runtime = "nodejs";

function cleanText(value: unknown, field: string, minimum = 1, maximum = 80) {
  if (typeof value !== "string") throw new Error(`${field} is required.`);
  const cleaned = value.trim();
  if (cleaned.length < minimum || cleaned.length > maximum) throw new Error(`${field} must be between ${minimum} and ${maximum} characters.`);
  return cleaned;
}

async function ensureMembership(userId: string, householdId: string) {
  const currentHousehold = getUserHousehold(userId);
  if (currentHousehold && currentHousehold.id !== householdId) throw new Error(`This account already belongs to ${currentHousehold.name}.`);
  if (!currentHousehold) {
    await auth.api.addMember({ body: { userId, organizationId: householdId, role: "member" } });
  }
}

export async function POST(request: Request, context: RouteContext<"/api/admin/people/[id]/assignment">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;

  try {
    const { id } = await context.params;
    const body = await request.json() as { householdId?: unknown; accountId?: unknown; name?: unknown; email?: unknown; username?: unknown };
    const householdId = cleanText(body.householdId, "Household", 1, 128);
    const household = listHouseholds().find((item) => item.id === householdId);
    if (!household) return Response.json({ error: "Household not found." }, { status: 404 });

    const existingLink = getPersonLink(id);
    if (existingLink?.householdId) return Response.json({ error: `This person already belongs to ${existingLink.householdName}.` }, { status: 409 });
    if (existingLink) {
      await ensureMembership(existingLink.userId, householdId);
      assignPersonRecords(id, householdId);
      return Response.json({ account: existingLink, household });
    }

    const unifiPerson = (await listUserInventory()).find((person) => person.id === id);
    if (!unifiPerson) return Response.json({ error: "UniFi person not found." }, { status: 404 });

    if (typeof body.accountId === "string" && body.accountId) {
      const account = listAssignableAccounts().find((item) => item.id === body.accountId);
      if (!account) return Response.json({ error: "That Gatey account is no longer available to link." }, { status: 409 });
      await ensureMembership(account.id, householdId);
      linkUnifiPerson(id, account.id);
      assignPersonRecords(id, householdId);
      return Response.json({ account, household });
    }

    const name = cleanText(body.name, "Person's name");
    const email = cleanText(body.email, "Email", 3, 254).toLowerCase();
    const username = cleanText(body.username, "Username", 3, 64);
    const existingUser = getUserByEmail(email);
    if (existingUser) {
      if (!listAssignableAccounts().some((item) => item.id === existingUser.id)) {
        return Response.json({ error: "That Gatey account is already linked to another UniFi person." }, { status: 409 });
      }
      await ensureMembership(existingUser.id, householdId);
      linkUnifiPerson(id, existingUser.id);
      assignPersonRecords(id, householdId);
      return Response.json({ account: existingUser, household, reusedAccount: true });
    }

    const password = createTemporaryPassword();
    const created = await auth.api.createUser({
      body: { email, password, name, role: "user", data: { username, emailVerified: true } },
      headers: request.headers,
    });
    try {
      await ensureMembership(created.user.id, householdId);
      linkUnifiPerson(id, created.user.id);
      assignPersonRecords(id, householdId);
    } catch (error) {
      await auth.api.removeUser({ body: { userId: created.user.id }, headers: request.headers });
      throw error;
    }

    return Response.json({
      account: { id: created.user.id, name, email, username },
      household,
      welcomeMessage: buildWelcomeMessage({ householdName: household.name, name, email, username, password }),
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not assign this person." }, { status: 400 });
  }
}
