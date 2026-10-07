import { redeemShortcutPairing, shortcutHeaders } from "@/lib/shortcuts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let code: unknown;
  try { code = (await request.json())?.code; } catch { /* Invalid input fails closed. */ }
  const connection = typeof code === "string" ? redeemShortcutPairing(code) : null;
  if (!connection) return Response.json({ message: "This connection link expired or was already used. Return to Gatey and create a new link." }, { status: 401, headers: shortcutHeaders });
  return Response.json(connection, { headers: shortcutHeaders });
}
