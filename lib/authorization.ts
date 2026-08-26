import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type AuthSession } from "@/lib/auth";

export type Household = {
  id: string;
  name: string;
  slug: string;
};

export type RequestAuth = {
  session: AuthSession;
  household: Household | null;
  households: Household[];
  isSystemAdmin: boolean;
};

function hasRole(role: unknown, expected: string) {
  return String(role ?? "").split(",").includes(expected);
}

export async function getRequestAuth(requestHeaders: Headers): Promise<RequestAuth | null> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;

  const households = await auth.api.listOrganizations({ headers: requestHeaders });
  const activeHouseholdId = session.session.activeOrganizationId;
  const household = households.find((organization) => organization.id === activeHouseholdId) ?? households[0] ?? null;

  return {
    session,
    household,
    households,
    isSystemAdmin: hasRole(session.user.role, "admin"),
  };
}

export const requirePageAuth = cache(async () => {
  const context = await getRequestAuth(await headers());
  if (!context) redirect("/sign-in");
  return context;
});

export async function requirePageHousehold() {
  const context = await requirePageAuth();
  if (!context.household) redirect("/no-household");
  return { ...context, household: context.household };
}

export async function requirePageAdmin() {
  const context = await requirePageAuth();
  if (!context.isSystemAdmin) redirect("/");
  return context;
}
