import { listCredentialUsageLookups, listCredentials } from "@/lib/db";
import { getCredentialLastUse } from "@/lib/unifi-access";
import { authorizeHouseholdRequest } from "@/lib/api-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CredentialUsage = { lastUsedAt?: string; lastUseKnown: boolean };

export async function GET(request: Request) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;
  const householdId = authorization.context.household.id;
  const credentials = listCredentials(householdId);
  const lastUseByCredentialId = new Map<string, CredentialUsage>(await Promise.all(listCredentialUsageLookups(householdId).map(async (lookup): Promise<[string, CredentialUsage]> => {
    try {
      return [lookup.id, { lastUsedAt: await getCredentialLastUse(lookup.controllerVisitorId, lookup.startsAt, lookup.endsAt), lastUseKnown: true }];
    } catch {
      // UniFi history is helpful context, never a reason to hide usable codes.
      return [lookup.id, { lastUseKnown: false }];
    }
  })));
  return Response.json({ credentials: credentials.map((credential) => ({ ...credential, ...lastUseByCredentialId.get(credential.id) })) });
}

export async function POST(request: Request) {
  const authorization = await authorizeHouseholdRequest(request);
  if (authorization.response) return authorization.response;
  return Response.json({ error: "This legacy endpoint is read-only. Create codes through /api/gate-codes." }, { status: 410 });
}
