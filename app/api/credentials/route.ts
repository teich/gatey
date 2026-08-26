import { insertCredential, listCredentials } from "@/lib/db";
import { provisionCredential } from "@/lib/unifi-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ credentials: listCredentials() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { label?: unknown; startsAt?: unknown; endsAt?: unknown };
    const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : "Guest";
    const startsAt = new Date(String(body.startsAt));
    const endsAt = new Date(String(body.endsAt));
    if (Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf()) || endsAt <= startsAt) {
      return Response.json({ error: "Choose a valid start and end time." }, { status: 400 });
    }
    const { credential, visitorId } = await provisionCredential({ label, startsAt, endsAt });
    insertCredential(credential, visitorId);
    return Response.json({ credential }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create the guest code." }, { status: 502 });
  }
}
