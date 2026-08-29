import { authorizeAdminRequest } from "@/lib/api-authorization";
import { deleteUserPhoneNumber, updateUserPhoneNumber } from "@/lib/phone-access";

export const runtime = "nodejs";

function input(body: Record<string, unknown>) {
  if (typeof body.phoneE164 !== "string" || typeof body.label !== "string") throw new Error("Phone number and label are required.");
  return {
    phoneE164: body.phoneE164,
    label: body.label.trim().slice(0, 80) || "Mobile",
    notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 240) : "",
    enabled: body.enabled !== false,
    canOpen: body.canOpen === true,
    canHoldOpen: body.canHoldOpen === true,
  };
}

export async function PATCH(request: Request, context: RouteContext<"/api/admin/users/[userId]/phones/[phoneId]">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;
  try {
    const { userId, phoneId } = await context.params;
    const phone = updateUserPhoneNumber(userId, phoneId, input(await request.json() as Record<string, unknown>));
    if (!phone) return Response.json({ error: "Phone number not found." }, { status: 404 });
    return Response.json({ phone });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update this phone number.";
    const duplicate = message.includes("UNIQUE constraint failed");
    return Response.json({ error: duplicate ? "That phone number is already assigned to a Gatey account." : message }, { status: duplicate ? 409 : 400 });
  }
}

export async function DELETE(request: Request, context: RouteContext<"/api/admin/users/[userId]/phones/[phoneId]">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;
  const { userId, phoneId } = await context.params;
  if (!deleteUserPhoneNumber(userId, phoneId)) return Response.json({ error: "Phone number not found." }, { status: 404 });
  return new Response(null, { status: 204 });
}
