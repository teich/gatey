import { recordAuditEvent } from "@/lib/audit-log";
import { claimShortcutOpen, markShortcutUsed, shortcutHeaders } from "@/lib/shortcuts";
import { unlockGate } from "@/lib/unifi-access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const claim = claimShortcutOpen(token);
  if (claim.state === "unauthorized") return Response.json({ message: "Gatey access is disconnected. Reconnect your shortcut in Gatey." }, { status: 401, headers: shortcutHeaders });
  if (claim.state === "cooldown") return Response.json({ message: "An opening was requested recently. Wait 30 seconds before trying again." }, { status: 429, headers: { ...shortcutHeaders, "Retry-After": "30" } });
  const audit = { actorUserId: claim.userId, actorName: claim.actorName, householdId: claim.householdId, householdName: claim.householdName, action: "gate.open", details: { source: "shortcut" } };
  try {
    await unlockGate({ id: claim.userId, name: claim.actorName });
  } catch {
    try { recordAuditEvent({ ...audit, outcome: "failed" }); } catch { /* Preserve controller outcome. */ }
    return Response.json({ message: "Gate opening could not be confirmed. Check the gate in Gatey before trying again." }, { status: 503, headers: shortcutHeaders });
  }
  try {
    markShortcutUsed(claim.connectionId);
    recordAuditEvent({ ...audit, outcome: "succeeded" });
  } catch { /* The controller already accepted the request. */ }
  return Response.json({ ok: true, message: "Gate opening requested." }, { headers: shortcutHeaders });
}
