// Gatey's public origin. Every cookie-authenticated mutation must come from it.
export function appOrigin() {
  return new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000").origin;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// These authenticate with their own secret instead of the session cookie, or
// (Better Auth) check the request origin themselves.
const EXEMPT_PATHS = ["/api/auth/", "/api/internal/", "/api/shortcuts/open"];

// SameSite cookies stop other sites but not sibling subdomains, so API
// mutations also require Gatey's own Origin header.
export function rejectsCrossOriginMutation(request: Request): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return false;
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith("/api/") || EXEMPT_PATHS.some((path) => pathname === path || pathname.startsWith(path))) return false;
  return request.headers.get("origin") !== appOrigin();
}
