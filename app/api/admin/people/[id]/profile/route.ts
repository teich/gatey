import { authorizeAdminRequest } from "@/lib/api-authorization";
import { auth } from "@/lib/auth";
import { getPersonLink, reassignPersonHousehold, validatePersonHouseholdReassignment } from "@/lib/admin-assignments";
import { listHouseholds } from "@/lib/households";
import { managedAccountEmail, optionalAccountEmail } from "@/lib/account-email";
import { normalizeE164, replaceUserPhoneNumbers, type PhoneAccessInput } from "@/lib/phone-access";

export const runtime = "nodejs";

function cleanText(value: unknown, field: string, minimum: number, maximum: number) {
  if (typeof value !== "string") throw new Error(`${field} is required.`);
  const cleaned = value.trim();
  if (cleaned.length < minimum || cleaned.length > maximum) throw new Error(`${field} must be between ${minimum} and ${maximum} characters.`);
  return cleaned;
}

function phoneInput(value: unknown): PhoneAccessInput {
  if (!value || typeof value !== "object") throw new Error("Each phone number must be valid.");
  const phone = value as Record<string, unknown>;
  return {
    id: typeof phone.id === "string" ? phone.id : undefined,
    phoneE164: normalizeE164(cleanText(phone.phoneE164, "Phone number", 2, 32)),
    label: cleanText(phone.label, "Phone label", 1, 80),
    notes: typeof phone.notes === "string" ? phone.notes.trim().slice(0, 240) : "",
    enabled: phone.enabled !== false,
    canOpen: phone.canOpen === true,
    canHoldOpen: phone.canHoldOpen === true,
  };
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
    if (!Array.isArray(body.phones)) throw new Error("Phone access is required.");
    const phones = body.phones.map(phoneInput);
    if (new Set(phones.map((phone) => phone.phoneE164)).size !== phones.length) throw new Error("Each phone number can only be listed once.");
    if (!listHouseholds().some((household) => household.id === householdId)) {
      return Response.json({ error: "Household not found." }, { status: 404 });
    }
    validatePersonHouseholdReassignment(link.userId, householdId);

    await auth.api.adminUpdateUser({
      body: { userId: link.userId, data: { name, email, emailVerified: Boolean(contactEmail) } },
      headers: request.headers,
    });
    reassignPersonHousehold(id, link.userId, householdId);
    replaceUserPhoneNumbers(link.userId, phones);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update this person.";
    return Response.json({ error: message.includes("UNIQUE constraint failed") ? "That phone number is already assigned to a Gatey account." : message }, { status: message.includes("UNIQUE constraint failed") ? 409 : 400 });
  }
}
