import { auth } from "@/lib/auth";
import { authorizeAdminRequest } from "@/lib/api-authorization";
import { getUserByEmail, getUserHousehold, listHouseholds, removeCreatorFromHousehold } from "@/lib/households";
import { buildWelcomeMessage, createTemporaryPassword } from "@/lib/welcome-message";
import { managedAccountEmail, optionalAccountEmail } from "@/lib/account-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function cleanText(value: unknown, field: string, minimum = 1, maximum = 80) {
  if (typeof value !== "string") throw new Error(`${field} is required.`);
  const cleaned = value.trim();
  if (cleaned.length < minimum || cleaned.length > maximum) {
    throw new Error(`${field} must be between ${minimum} and ${maximum} characters.`);
  }
  return cleaned;
}

function slugFrom(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;
  return Response.json({ households: listHouseholds() });
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;

  try {
    const body = await request.json() as { name?: unknown; slug?: unknown };
    const name = cleanText(body.name, "Household name");
    const requestedSlug = typeof body.slug === "string" ? body.slug.trim() : "";
    const slug = slugFrom(requestedSlug || name);
    if (!slug) return Response.json({ error: "Choose a household name that can make a URL-safe slug." }, { status: 400 });

    const household = await auth.api.createOrganization({
      body: {
        name,
        slug,
        keepCurrentActiveOrganization: true,
      },
      headers: request.headers,
    });
    removeCreatorFromHousehold(household.id, authorization.context.session.user.id);
    return Response.json({ household }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error, "Could not create the household.") }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;

  try {
    const body = await request.json() as { householdId?: unknown; name?: unknown; email?: unknown; username?: unknown };
    const householdId = cleanText(body.householdId, "Household", 1, 128);
    const household = listHouseholds().find((item) => item.id === householdId);
    if (!household) return Response.json({ error: "Household not found." }, { status: 404 });

    const contactEmail = optionalAccountEmail(body.email);
    const username = cleanText(body.username, "Username", 3, 64);
    const email = contactEmail || managedAccountEmail(username);
    const existingUser = contactEmail ? getUserByEmail(contactEmail) : null;
    if (existingUser) {
      const currentHousehold = getUserHousehold(existingUser.id);
      if (currentHousehold) {
        return Response.json({ error: `${existingUser.name} already belongs to ${currentHousehold.name}.` }, { status: 409 });
      }

      await auth.api.addMember({
        body: {
          userId: existingUser.id,
          organizationId: householdId,
          role: "member",
        },
      });
      return Response.json({
        member: {
          name: existingUser.name,
          email: existingUser.email,
          username: existingUser.username,
        },
        reusedAccount: true,
      });
    }

    const name = cleanText(body.name, "Person's name");
    const password = createTemporaryPassword();
    const created = await auth.api.createUser({
      body: {
        email,
        password,
        name,
        role: "user",
        data: {
          username,
          emailVerified: Boolean(contactEmail),
        },
      },
      headers: request.headers,
    });

    try {
      await auth.api.addMember({
        body: {
          userId: created.user.id,
          organizationId: householdId,
          role: "member",
        },
      });
    } catch (error) {
      await auth.api.removeUser({ body: { userId: created.user.id }, headers: request.headers });
      throw error;
    }

    return Response.json({
      member: {
        name,
        email: contactEmail,
        username,
      },
      ...(contactEmail ? { welcomeMessage: buildWelcomeMessage({ householdName: household.name, name, email: contactEmail, username, password }) } : {}),
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error, "Could not add this person to the household.") }, { status: 400 });
  }
}
