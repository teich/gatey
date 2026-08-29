import { authorizeAdminRequest } from "@/lib/api-authorization";
import { createUserPhoneNumber, listUserPhoneNumbers } from "@/lib/phone-access";

export const runtime = "nodejs";

function cleanText(value: unknown, field: string, maximum: number) {
  if (typeof value !== "string") throw new Error(`${field} is required.`);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maximum) throw new Error(`${field} must be between 1 and ${maximum} characters.`);
  return cleaned;
}

export async function POST(request: Request, context: RouteContext<"/api/admin/users/[userId]/phones">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;
  try {
    const { userId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const phone = createUserPhoneNumber(userId, {
      phoneE164: cleanText(body.phoneE164, "Phone number", 32),
      label: cleanText(body.label || "Mobile", "Label", 80),
      notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 240) : "",
      enabled: body.enabled !== false,
      canOpen: body.canOpen !== false,
      canHoldOpen: body.canHoldOpen === true,
    });
    return Response.json({ phone }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add this phone number.";
    const duplicate = message.includes("UNIQUE constraint failed");
    return Response.json({ error: duplicate ? "That phone number is already assigned to a Gatey account." : message }, { status: duplicate ? 409 : 400 });
  }
}

export async function GET(request: Request, context: RouteContext<"/api/admin/users/[userId]/phones">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;
  const { userId } = await context.params;
  return Response.json({ phones: listUserPhoneNumbers(userId) });
}
