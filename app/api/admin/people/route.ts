import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { authorizeAdminRequest } from "@/lib/api-authorization";
import { auth } from "@/lib/auth";
import { database } from "@/lib/database";
import { member, unifiPersonLinks, userPhoneNumbers } from "@/lib/schema";
import { listHouseholds } from "@/lib/households";
import { managedAccountEmail, optionalAccountEmail } from "@/lib/account-email";
import { normalizeE164 } from "@/lib/phone-access";
import { assertControllerChangesAllowed, createUnifiPerson, listAccessPolicies } from "@/lib/unifi-access";
import { refreshUnifiInventory } from "@/lib/unifi-inventory-cache";
import { buildWelcomeMessage, createTemporaryPassword } from "@/lib/welcome-message";
import { recordAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;
  try {
    return Response.json({ policies: await listAccessPolicies() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load access policies." }, { status: 502 });
  }
}

function requiredText(value: unknown, label: string, maximum = 80) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) throw new Error(`${label} is required and must be at most ${maximum} characters.`);
  return value.trim();
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;

  let accountId: string | undefined;
  let controllerUserId: string | undefined;
  let welcomeMessage: string | undefined;
  let linked = false;
  try {
    assertControllerChangesAllowed();
    const body = await request.json() as Record<string, unknown>;
    const firstName = requiredText(body.firstName, "First name", 40);
    const lastName = requiredText(body.lastName, "Last name", 40);
    const name = `${firstName} ${lastName}`;
    const username = requiredText(body.username, "Username", 64).toLowerCase();
    if (!/^[a-z0-9_.]{3,64}$/.test(username)) throw new Error("Use 3–64 letters, numbers, underscores, or periods for the username.");
    const email = optionalAccountEmail(body.email);
    const household = listHouseholds().find((item) => item.id === body.householdId);
    if (!household) throw new Error("Choose an existing household.");
    // Validate the controller connection and chosen policy before creating accounts.
    if (!(await listAccessPolicies()).some((policy) => policy.id === body.policyId)) throw new Error("Choose an available UniFi access policy.");
    const phone = typeof body.phone === "string" && body.phone.trim() ? normalizeE164(body.phone) : null;
    if (phone && database.select({ id: userPhoneNumbers.id }).from(userPhoneNumbers).where(eq(userPhoneNumbers.phoneE164, phone)).get()) {
      throw new Error("That phone number is already assigned to a Gatey account.");
    }

    const password = createTemporaryPassword();
    // The unique username reserves this operation before making a non-idempotent
    // controller request. Keep this account on failure: retrying the same form
    // cannot silently create a second UniFi person after a timeout.
    const created = await auth.api.createUser({
      body: { name, email: email || managedAccountEmail(username), password, role: "user", data: { username, emailVerified: Boolean(email) } },
      headers: request.headers,
    });
    accountId = created.user.id;
    welcomeMessage = buildWelcomeMessage({ name, email, username, password, householdName: household.name });
    controllerUserId = await createUnifiPerson({ firstName, lastName, email });
    const now = new Date();
    database.transaction((tx) => {
      tx.insert(unifiPersonLinks).values({ controllerUserId: controllerUserId!, userId: accountId!, linkedAt: now.toISOString() }).run();
      tx.insert(member).values({ id: randomUUID(), userId: accountId!, organizationId: household.id, role: "member", createdAt: now }).run();
      if (phone) tx.insert(userPhoneNumbers).values({ id: randomUUID(), userId: accountId!, phoneE164: phone, label: "Mobile", notes: "", enabled: true, canOpen: true, canHoldOpen: false, createdAt: now.toISOString(), updatedAt: now.toISOString() }).run();
    });
    linked = true;
    recordAuditEvent({ actorUserId: authorization.context.session.user.id, actorName: authorization.context.session.user.name, householdId: household.id, householdName: household.name, action: "person.create", outcome: "succeeded", details: { controllerUserId, userId: accountId } });
    // Inventory problems must not turn a successful creation into a retry.
    await refreshUnifiInventory({ force: true }).catch(() => undefined);
    return Response.json({ personId: controllerUserId, welcomeMessage }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create this person.";
    // A failure after the local commit must still return the saved identity so
    // the UI continues credential setup instead of offering to create again.
    if (linked) return Response.json({ personId: controllerUserId, welcomeMessage, warning: message }, { status: 201, headers: { "Cache-Control": "no-store" } });
    return Response.json({
      error: accountId
        ? `${message} The Gatey account was saved, but setup is incomplete. Do not create another person. Refresh People and use Assign to link the UniFi person to this existing account. ${controllerUserId ? `UniFi person ID: ${controllerUserId}.` : "UniFi may have created the person before the request failed; check its people list first."}`
        : message,
      // Credentials remain available even if the external service fails.
      ...(accountId ? { needsRecovery: true, welcomeMessage } : {}),
    }, { status: accountId ? 502 : 400, headers: { "Cache-Control": "no-store" } });
  }
}
