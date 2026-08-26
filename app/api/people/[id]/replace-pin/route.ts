import { savePersonPin } from "@/lib/db";
import { replaceUserPin } from "@/lib/unifi-access";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/people/[id]/replace-pin">) {
  const { id } = await context.params;
  try {
    const body = await request.json() as { label?: unknown };
    const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 160) : "UniFi person";
    const pin = await replaceUserPin(id);
    savePersonPin({ userId: id, label, pin });
    return Response.json({ pin });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not replace the PIN." }, { status: 502 });
  }
}
