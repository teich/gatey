import { authorizeHouseholdRequest } from "@/lib/api-authorization";
import { createShortcutConnection, getShortcutConnection, revokeShortcutConnection, shortcutHeaders } from "@/lib/shortcuts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;
  const { session, household } = authorization.context;
  return Response.json({ connection: getShortcutConnection(session.user.id, household.id) }, { headers: shortcutHeaders });
}

export async function POST(request: Request) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;
  const { session, household } = authorization.context;
  return Response.json(createShortcutConnection(session.user.id, household.id), { headers: shortcutHeaders });
}

export async function DELETE(request: Request) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;
  const { session, household } = authorization.context;
  revokeShortcutConnection(session.user.id, household.id);
  return Response.json({ disconnected: true }, { headers: shortcutHeaders });
}
