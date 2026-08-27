import { authorizeHouseholdRequest } from "@/lib/api-authorization";
import { getGateStatus, unlockGate } from "@/lib/unifi-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };

export async function GET(request: Request) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;

  try {
    return Response.json(await getGateStatus(), { headers: noStoreHeaders });
  } catch {
    return Response.json({ error: "Gate status is unavailable." }, { status: 503, headers: noStoreHeaders });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;

  try {
    const { user } = authorization.context.session;
    return Response.json(await unlockGate({ id: user.id, name: user.name || "Gatey resident" }), { headers: noStoreHeaders });
  } catch {
    return Response.json({ error: "Gate could not be opened. Try again." }, { status: 503, headers: noStoreHeaders });
  }
}
