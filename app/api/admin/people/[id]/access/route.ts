import { authorizeAdminRequest } from "@/lib/api-authorization";
import { getPersonLink } from "@/lib/admin-assignments";
import { assignUserAccessPolicy, listAccessPolicies, replaceUserPin } from "@/lib/unifi-access";
import { savePersonPin } from "@/lib/db";
import { refreshUnifiInventory } from "@/lib/unifi-inventory-cache";
import { recordAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;
  const { id } = await context.params;
  const person = getPersonLink(id);
  if (!person?.householdId)
    return Response.json({ error: "Assign this person to a household first." }, { status: 409 });
  let policyAssigned = false;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const policyId = typeof body.policyId === "string" ? body.policyId : "";
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";
    if (pin && !/^\d{4,8}$/.test(pin)) throw new Error("Use a 4 to 8 digit PIN.");
    if (!(await listAccessPolicies()).some((policy) => policy.id === policyId))
      throw new Error("Choose an available access policy.");
    await assignUserAccessPolicy(id, policyId);
    policyAssigned = true;
    if (pin) {
      await replaceUserPin(id, pin);
      savePersonPin({ householdId: person.householdId, userId: id, label: person.accountName, pin });
    }
    recordAuditEvent({
      actorUserId: authorization.context.session.user.id,
      actorName: authorization.context.session.user.name,
      householdId: person.householdId,
      householdName: person.householdName,
      action: "person.access.update",
      outcome: "succeeded",
      details: { controllerUserId: id, policyId },
    });
    await refreshUnifiInventory({ force: true }).catch(() => undefined);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save access.";
    return Response.json(
      {
        error: `${policyAssigned ? "The access policy was saved, but setup did not finish. " : ""}${message} You can retry access setup for this person.`,
      },
      { status: 502 },
    );
  }
}
