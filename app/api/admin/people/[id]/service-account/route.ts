import { authorizeAdminRequest } from "@/lib/api-authorization";
import { getPersonLink } from "@/lib/admin-assignments";
import { recordAuditEvent } from "@/lib/audit-log";
import { listUserInventory } from "@/lib/unifi-access";
import { listUnifiServiceAccounts, markUnifiServiceAccount, restoreUnifiServiceAccount } from "@/lib/service-accounts";

export const runtime = "nodejs";

export async function PUT(request: Request, context: RouteContext<"/api/admin/people/[id]/service-account">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;

  try {
    const { id } = await context.params;
    if (getPersonLink(id)) return Response.json({ error: "Remove this person's Gatey account link before classifying it as a service account." }, { status: 409 });
    const person = (await listUserInventory()).find((item) => item.id === id);
    if (!person) return Response.json({ error: "UniFi person not found." }, { status: 404 });
    const actor = authorization.context.session.user;
    markUnifiServiceAccount({ controllerUserId: id, label: person.name, actorUserId: actor.id, actorName: actor.name || "Gatey administrator" });
    try { recordAuditEvent({ actorUserId: actor.id, actorName: actor.name || "Gatey administrator", householdId: null, householdName: null, action: "person.service-account-marked", outcome: "succeeded", details: { person: person.name, controllerUserId: id } }); } catch { /* Preserve the classification if audit logging is unavailable. */ }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not classify this service account." }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: RouteContext<"/api/admin/people/[id]/service-account">) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;

  const { id } = await context.params;
  const existing = listUnifiServiceAccounts().get(id);
  if (!existing || !restoreUnifiServiceAccount(id)) return Response.json({ error: "Service account classification not found." }, { status: 404 });
  const actor = authorization.context.session.user;
  try { recordAuditEvent({ actorUserId: actor.id, actorName: actor.name || "Gatey administrator", householdId: null, householdName: null, action: "person.service-account-restored", outcome: "succeeded", details: { person: existing.label, controllerUserId: id } }); } catch { /* Preserve the restore if audit logging is unavailable. */ }
  return new Response(null, { status: 204 });
}
