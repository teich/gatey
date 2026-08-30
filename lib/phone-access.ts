import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { database } from "@/lib/database";
import { member, organization, user, userPhoneNumbers } from "@/lib/schema";

export type PhoneAccess = {
  id: string;
  userId: string;
  phoneE164: string;
  label: string;
  notes: string;
  enabled: boolean;
  canOpen: boolean;
  canHoldOpen: boolean;
};

export type AuthorizedPhoneCaller = PhoneAccess & {
  userName: string;
  householdId: string;
  householdName: string;
};

export function normalizeE164(value: string): string {
  const compact = value.trim().replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{1,14}$/.test(compact)) {
    throw new Error("Phone number must use E.164 format, such as +17075551111.");
  }
  return compact;
}

export function listUserPhoneNumbers(userId: string): PhoneAccess[] {
  return database.select({
    id: userPhoneNumbers.id,
    userId: userPhoneNumbers.userId,
    phoneE164: userPhoneNumbers.phoneE164,
    label: userPhoneNumbers.label,
    notes: userPhoneNumbers.notes,
    enabled: userPhoneNumbers.enabled,
    canOpen: userPhoneNumbers.canOpen,
    canHoldOpen: userPhoneNumbers.canHoldOpen,
  }).from(userPhoneNumbers).where(eq(userPhoneNumbers.userId, userId))
    .orderBy(desc(userPhoneNumbers.enabled), sql`${userPhoneNumbers.label} collate nocase`, userPhoneNumbers.phoneE164).all();
}

export function findAuthorizedPhoneCaller(value: string): AuthorizedPhoneCaller | null {
  let phoneE164: string;
  try { phoneE164 = normalizeE164(value); } catch { return null; }

  return database.select({
    id: userPhoneNumbers.id,
    userId: userPhoneNumbers.userId,
    phoneE164: userPhoneNumbers.phoneE164,
    label: userPhoneNumbers.label,
    notes: userPhoneNumbers.notes,
    enabled: userPhoneNumbers.enabled,
    canOpen: userPhoneNumbers.canOpen,
    canHoldOpen: userPhoneNumbers.canHoldOpen,
    userName: user.name,
    householdId: organization.id,
    householdName: organization.name,
  }).from(userPhoneNumbers)
    .innerJoin(user, eq(user.id, userPhoneNumbers.userId))
    .innerJoin(member, eq(member.userId, user.id))
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(userPhoneNumbers.phoneE164, phoneE164), eq(userPhoneNumbers.enabled, true)))
    .limit(1).get() ?? null;
}

export function createUserPhoneNumber(userId: string, input: Omit<PhoneAccess, "id" | "userId">): PhoneAccess {
  const id = randomUUID();
  const now = new Date().toISOString();
  const phoneE164 = normalizeE164(input.phoneE164);
  database.insert(userPhoneNumbers).values({ id, userId, phoneE164, label: input.label, notes: input.notes, enabled: input.enabled, canOpen: input.canOpen, canHoldOpen: input.canHoldOpen, createdAt: now, updatedAt: now }).run();
  return { id, userId, ...input, phoneE164 };
}

export function updateUserPhoneNumber(userId: string, id: string, input: Omit<PhoneAccess, "id" | "userId">): PhoneAccess | null {
  const phoneE164 = normalizeE164(input.phoneE164);
  const result = database.update(userPhoneNumbers).set({ phoneE164, label: input.label, notes: input.notes, enabled: input.enabled, canOpen: input.canOpen, canHoldOpen: input.canHoldOpen, updatedAt: new Date().toISOString() })
    .where(and(eq(userPhoneNumbers.id, id), eq(userPhoneNumbers.userId, userId))).run();
  return result.changes ? { id, userId, ...input, phoneE164 } : null;
}

export function deleteUserPhoneNumber(userId: string, id: string): boolean {
  return Boolean(database.delete(userPhoneNumbers).where(and(eq(userPhoneNumbers.id, id), eq(userPhoneNumbers.userId, userId))).run().changes);
}

export type PhoneAccessInput = Omit<PhoneAccess, "id" | "userId"> & { id?: string };

export function replaceUserPhoneNumbers(userId: string, inputs: PhoneAccessInput[]): PhoneAccess[] {
  const existingIds = new Set(listUserPhoneNumbers(userId).map((phone) => phone.id));
  const now = new Date().toISOString();
  const prepared = inputs.map((input) => ({
    ...input,
    id: input.id && existingIds.has(input.id) ? input.id : randomUUID(),
    phoneE164: normalizeE164(input.phoneE164),
  }));

  if (new Set(prepared.map((phone) => phone.phoneE164)).size !== prepared.length) {
    throw new Error("Each phone number can only be listed once.");
  }

  database.transaction((tx) => {
    tx.delete(userPhoneNumbers).where(eq(userPhoneNumbers.userId, userId)).run();
    if (prepared.length) {
      tx.insert(userPhoneNumbers).values(prepared.map((phone) => ({ ...phone, userId, createdAt: now, updatedAt: now }))).run();
    }
  });

  return prepared.map((phone) => ({ ...phone, userId }));
}
