import { authorizeAdminRequest } from "@/lib/api-authorization";
import { refreshUnifiInventory } from "@/lib/unifi-inventory-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (authorization.response) return authorization.response;

  try {
    return Response.json(await refreshUnifiInventory(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Could not refresh UniFi inventory.",
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
