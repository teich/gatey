import "server-only";

import { getRequestAuth, type RequestAuth } from "@/lib/authorization";

type AuthorizedHousehold = RequestAuth & {
  household: NonNullable<RequestAuth["household"]>;
};

type AuthorizationResult<T> =
  | { context: T; response?: never }
  | { context?: never; response: Response };

export async function authorizeHouseholdRequest(request: Request): Promise<AuthorizationResult<AuthorizedHousehold>> {
  const context = await getRequestAuth(request.headers);
  if (!context) {
    return { response: Response.json({ error: "Sign in to continue." }, { status: 401 }) };
  }
  if (!context.household) {
    return { response: Response.json({ error: "Your account is not assigned to a household." }, { status: 403 }) };
  }
  return { context: { ...context, household: context.household } };
}

export async function authorizeAdminRequest(request: Request, requireHousehold = false): Promise<AuthorizationResult<RequestAuth>> {
  const context = await getRequestAuth(request.headers);
  if (!context) {
    return { response: Response.json({ error: "Sign in to continue." }, { status: 401 }) };
  }
  if (!context.isSystemAdmin) {
    return { response: Response.json({ error: "Administrator access is required." }, { status: 403 }) };
  }
  if (requireHousehold && !context.household) {
    return { response: Response.json({ error: "Choose a household first." }, { status: 403 }) };
  }
  return { context };
}
