import "server-only";

import { database } from "@/lib/database";

export type HouseholdMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
};

export type HouseholdAdminRecord = {
  id: string;
  name: string;
  slug: string;
  members: HouseholdMember[];
};

type HouseholdRow = {
  id: string;
  name: string;
  slug: string;
};

type MemberRow = HouseholdMember & {
  organizationId: string;
};

export function listHouseholds(): HouseholdAdminRecord[] {
  const households = database.prepare(`
    SELECT id, name, slug
    FROM organization
    ORDER BY name COLLATE NOCASE, createdAt
  `).all() as HouseholdRow[];
  const members = database.prepare(`
    SELECT
      member.id,
      member.organizationId,
      member.userId,
      member.role,
      user.name,
      user.email,
      user.username
    FROM member
    INNER JOIN user ON user.id = member.userId
    ORDER BY user.name COLLATE NOCASE, user.email COLLATE NOCASE
  `).all() as MemberRow[];

  const membersByHousehold = new Map<string, HouseholdMember[]>();
  for (const member of members) {
    const householdMembers = membersByHousehold.get(member.organizationId) ?? [];
    householdMembers.push({
      id: member.id,
      userId: member.userId,
      name: member.name,
      email: member.email,
      username: member.username,
      role: member.role,
    });
    membersByHousehold.set(member.organizationId, householdMembers);
  }

  return households.map((household) => ({
    ...household,
    members: membersByHousehold.get(household.id) ?? [],
  }));
}

export function getHousehold(id: string): HouseholdAdminRecord | null {
  return listHouseholds().find((household) => household.id === id) ?? null;
}

export function getHouseholdMember(householdId: string, memberId: string): HouseholdMember | null {
  const member = database.prepare(`
    SELECT
      member.id,
      member.userId,
      member.role,
      user.name,
      user.email,
      user.username
    FROM member
    INNER JOIN user ON user.id = member.userId
    WHERE member.organizationId = ? AND member.id = ?
  `).get(householdId, memberId) as HouseholdMember | undefined;
  return member ?? null;
}

export function getUserByEmail(email: string): { id: string; name: string; email: string; username: string | null } | null {
  const user = database.prepare(`
    SELECT id, name, email, username
    FROM user
    WHERE lower(email) = lower(?)
  `).get(email) as { id: string; name: string; email: string; username: string | null } | undefined;
  return user ?? null;
}

export function getUserHousehold(userId: string): { id: string; name: string } | null {
  const household = database.prepare(`
    SELECT organization.id, organization.name
    FROM member
    INNER JOIN organization ON organization.id = member.organizationId
    WHERE member.userId = ?
    LIMIT 1
  `).get(userId) as { id: string; name: string } | undefined;
  return household ?? null;
}

export function householdHasGateyRecords(householdId: string): boolean {
  const row = database.prepare(`
    SELECT EXISTS(
      SELECT 1 FROM credentials WHERE household_id = ?
      UNION ALL SELECT 1 FROM visitor_pins WHERE household_id = ?
      UNION ALL SELECT 1 FROM person_pins WHERE household_id = ?
    ) AS hasRecords
  `).get(householdId, householdId, householdId) as { hasRecords: number };
  return Boolean(row.hasRecords);
}
