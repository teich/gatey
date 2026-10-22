import { seedExistingActorLinks, syncAccessHistory } from "@/lib/access-history";
import { schedulerAuthorized } from "@/lib/scheduler-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
