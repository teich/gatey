import "server-only";

import { timingSafeEqual } from "node:crypto";

// The systemd timers call these endpoints over loopback. Cloudflare adds
// CF-Connecting-IP to every tunnelled request, so a request carrying it came
// from the internet and is refused even with the right secret.
export function schedulerAuthorized(request: Request) {
  if (request.headers.has("cf-connecting-ip")) return false;
  const secret = process.env.GATEY_SCHEDULER_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;

  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
