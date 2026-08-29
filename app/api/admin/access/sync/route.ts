import { authorizeAdminRequest } from "@/lib/api-authorization";
import { seedExistingActorLinks, syncAccessHistory } from "@/lib/access-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;
  try {
    seedExistingActorLinks();
    return Response.json(await syncAccessHistory(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Access history could not be synchronized." }, { status: 502 });
  }
}
