import "server-only";

import { randomUUID } from "node:crypto";
import { database } from "@/lib/database";

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

type PhoneRow = {
  id: string;
  userId: string;
  phoneE164: string;
  label: string;
  notes: string;
  enabled: number;
  canOpen: number;
  canHoldOpen: number;
};

export function normalizeE164(value: string): string {
  const compact = value.trim().replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{1,14}$/.test(compact)) {
    throw new Error("Phone number must use E.164 format, such as +17075551111.");
  }
  return compact;
}

function mapPhone(row: PhoneRow): PhoneAccess {
  return {
    id: row.id,
    userId: row.userId,
    phoneE164: row.phoneE164,
    label: row.label,
    notes: row.notes,
    enabled: Boolean(row.enabled),
    canOpen: Boolean(row.canOpen),
    canHoldOpen: Boolean(row.canHoldOpen),
  };
}

export function listUserPhoneNumbers(userId: string): PhoneAccess[] {
  const rows = database.prepare(`
    SELECT id, user_id AS userId, phone_e164 AS phoneE164, label, notes,
      enabled, can_open AS canOpen, can_hold_open AS canHoldOpen
    FROM user_phone_numbers
    WHERE user_id = ?
    ORDER BY enabled DESC, label COLLATE NOCASE, phone_e164
  `).all(userId) as PhoneRow[];
  return rows.map(mapPhone);
}

export function findAuthorizedPhoneCaller(value: string): AuthorizedPhoneCaller | null {
  let phoneE164: string;
  try { phoneE164 = normalizeE164(value); } catch { return null; }

  const row = database.prepare(`
    SELECT
      user_phone_numbers.id,
      user_phone_numbers.user_id AS userId,
      user_phone_numbers.phone_e164 AS phoneE164,
      user_phone_numbers.label,
      user_phone_numbers.notes,
      user_phone_numbers.enabled,
      user_phone_numbers.can_open AS canOpen,
      user_phone_numbers.can_hold_open AS canHoldOpen,
      user.name AS userName,
      organization.id AS householdId,
      organization.name AS householdName
    FROM user_phone_numbers
    INNER JOIN user ON user.id = user_phone_numbers.user_id
    INNER JOIN member ON member.userId = user.id
    INNER JOIN organization ON organization.id = member.organizationId
    WHERE user_phone_numbers.phone_e164 = ? AND user_phone_numbers.enabled = 1
    LIMIT 1
  `).get(phoneE164) as (PhoneRow & { userName: string; householdId: string; householdName: string }) | undefined;
  return row ? { ...mapPhone(row), userName: row.userName, householdId: row.householdId, householdName: row.householdName } : null;
}

export function createUserPhoneNumber(userId: string, input: Omit<PhoneAccess, "id" | "userId">): PhoneAccess {
  const id = randomUUID();
  const now = new Date().toISOString();
  const phoneE164 = normalizeE164(input.phoneE164);
  database.prepare(`
    INSERT INTO user_phone_numbers
      (id, user_id, phone_e164, label, notes, enabled, can_open, can_hold_open, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, phoneE164, input.label, input.notes, Number(input.enabled), Number(input.canOpen), Number(input.canHoldOpen), now, now);
  return { id, userId, ...input, phoneE164 };
}

export function updateUserPhoneNumber(userId: string, id: string, input: Omit<PhoneAccess, "id" | "userId">): PhoneAccess | null {
  const phoneE164 = normalizeE164(input.phoneE164);
  const result = database.prepare(`
    UPDATE user_phone_numbers
    SET phone_e164 = ?, label = ?, notes = ?, enabled = ?, can_open = ?, can_hold_open = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(phoneE164, input.label, input.notes, Number(input.enabled), Number(input.canOpen), Number(input.canHoldOpen), new Date().toISOString(), id, userId);
  return result.changes ? { id, userId, ...input, phoneE164 } : null;
}

export function deleteUserPhoneNumber(userId: string, id: string): boolean {
  return Boolean(database.prepare("DELETE FROM user_phone_numbers WHERE id = ? AND user_id = ?").run(id, userId).changes);
}
