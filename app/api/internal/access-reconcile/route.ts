import { timingSafeEqual } from "node:crypto";
import { seedExistingActorLinks, syncAccessHistory } from "@/lib/access-history";

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
    seedExistingActorLinks();
    return Response.json(await syncAccessHistory(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("UniFi access-history reconciliation failed", error);
    return Response.json({ error: "Access-history synchronization is unavailable." }, { status: 503 });
  }
}
