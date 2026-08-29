import { authorizeHouseholdRequest } from "@/lib/api-authorization";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;
  return Response.json({ error: "This legacy endpoint is read-only. Manage codes through /api/gate-codes." }, { status: 410 });
}
