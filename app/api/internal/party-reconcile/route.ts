import { timingSafeEqual } from "node:crypto";
import { reconcilePartyMode } from "@/lib/party-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function schedulerAuthorized(request: Request) {
  const secret = process.env.GATEY_SCHEDULER_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;

  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(request: Request) {
  if (!schedulerAuthorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const party = await reconcilePartyMode();
    return Response.json({ party }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Party scheduler is unavailable." }, { status: 503 });
  }
}
