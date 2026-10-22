import { reconcilePartyMode } from "@/lib/party-mode";
import { schedulerAuthorized } from "@/lib/scheduler-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!schedulerAuthorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const party = await reconcilePartyMode();
    return Response.json({ party }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Party scheduler is unavailable." }, { status: 503 });
  }
}
