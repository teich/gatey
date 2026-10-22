import "server-only";

import { assertControllerChangesAllowed, jsonBody, request } from "./client";
import { replaceSubjectPin } from "./visitors";

type UnifiUser = {
  id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  alias?: string;
  status?: string;
  pin_code?: { token?: string } | null;
  access_policies?: Array<{ name?: string }>;
  nfc_cards?: unknown[];
};

export type UserInventoryItem = {
  id: string;
  name: string;
  status: string;
  hasPin: boolean;
  policyNames: string[];
  hasNfcCard: boolean;
};

export type AccessPolicyOption = { id: string; name: string };

const userPath = (userId: string) => `/users/${encodeURIComponent(userId)}`;

export async function listUserInventory(): Promise<UserInventoryItem[]> {
  const users = await request<UnifiUser[]>("/users?page_num=1&page_size=100&expand[]=access_policy");
  return users
    .map((user) => ({
      id: user.id,
      name:
        user.full_name || user.alias || [user.first_name, user.last_name].filter(Boolean).join(" ") || "Unnamed person",
      status: user.status || "UNKNOWN",
      hasPin: Boolean(user.pin_code?.token),
      policyNames: (user.access_policies || []).map((policy) => policy.name || "Unnamed policy"),
      hasNfcCard: Boolean(user.nfc_cards?.length),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function listAccessPolicies(): Promise<AccessPolicyOption[]> {
  const policies = await request<AccessPolicyOption[]>("/access_policies");
  return policies.map(({ id, name }) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function createUnifiPerson(input: {
  firstName: string;
  lastName: string;
  email: string | null;
}): Promise<string> {
  assertControllerChangesAllowed();
  const person = await request<{ id: string }>("/users", {
    method: "POST",
    ...jsonBody({
      first_name: input.firstName,
      last_name: input.lastName,
      ...(input.email ? { user_email: input.email } : {}),
    }),
  });
  if (!person?.id) throw new Error("UniFi did not return the new person's ID.");
  return person.id;
}

export async function assignUserAccessPolicy(userId: string, policyId: string) {
  assertControllerChangesAllowed();
  await request<null>(`${userPath(userId)}/access_policies`, {
    method: "PUT",
    ...jsonBody({ access_policy_ids: [policyId] }),
  });
}

export async function replaceUserPin(userId: string, requestedPin?: string): Promise<string> {
  return replaceSubjectPin(userPath(userId), requestedPin);
}
