import { authorizeHouseholdRequest } from "@/lib/api-authorization";
import { getCameraSnapshot, isCameraName } from "@/lib/camera-snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/cameras/[camera]/snapshot">) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;

  const { camera } = await context.params;
  if (!isCameraName(camera)) return Response.json({ error: "Camera not found." }, { status: 404 });

  try {
    const snapshot = await getCameraSnapshot(camera);
    return new Response(new Uint8Array(snapshot.image), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(snapshot.image.length),
        "Cache-Control": "private, no-store, max-age=0",
        "Vary": "Cookie",
        "X-Gatey-Captured-At": new Date(snapshot.capturedAt).toISOString(),
      },
    });
  } catch {
    return Response.json({ error: "Camera snapshot is unavailable." }, { status: 503 });
  }
}
