import "server-only";

import { database } from "@/lib/database";

export type HouseholdMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
  controllerUserId: string | null;
};

export type HouseholdAdminRecord = {
  id: string;
  name: string;
  slug: string;
  members: HouseholdMember[];
  visitorCount: number;
};

type HouseholdRow = {
  id: string;
  name: string;
  slug: string;
};

type MemberRow = HouseholdMember & {
  organizationId: string;
};

type VisitorCountRow = {
  householdId: string;
  visitorCount: number;
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
      user.username,
      unifi_person_links.controller_user_id AS controllerUserId
    FROM member
    INNER JOIN user ON user.id = member.userId
    LEFT JOIN unifi_person_links ON unifi_person_links.user_id = user.id
    ORDER BY user.name COLLATE NOCASE, user.email COLLATE NOCASE
  `).all() as MemberRow[];
  const visitorCounts = database.prepare(`
    SELECT household_id AS householdId, count(*) AS visitorCount
    FROM visitor_households
    GROUP BY household_id
  `).all() as VisitorCountRow[];
  const visitorCountByHousehold = new Map(visitorCounts.map((row) => [row.householdId, row.visitorCount]));

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
      controllerUserId: member.controllerUserId,
    });
    membersByHousehold.set(member.organizationId, householdMembers);
  }

  return households.map((household) => ({
    ...household,
    members: membersByHousehold.get(household.id) ?? [],
    visitorCount: visitorCountByHousehold.get(household.id) ?? 0,
  }));
}

export function getHousehold(id: string): HouseholdAdminRecord | null {
  return listHouseholds().find((household) => household.id === id) ?? null;
}

export function updateHousehold(id: string, input: { name: string; slug: string }): HouseholdAdminRecord | null {
  database.prepare(`
    UPDATE organization
    SET name = ?, slug = ?
    WHERE id = ?
  `).run(input.name, input.slug, id);
  return getHousehold(id);
}

export function deleteHousehold(id: string) {
  database.prepare("DELETE FROM organization WHERE id = ?").run(id);
}

// Better Auth creates an organization with the caller as a member. Gatey
// households are administered separately, so a newly-created household is
// intentionally left empty until a resident is added.
export function removeCreatorFromHousehold(householdId: string, userId: string) {
  database.prepare("DELETE FROM member WHERE organizationId = ? AND userId = ?").run(householdId, userId);
}

export function getHouseholdMember(householdId: string, memberId: string): HouseholdMember | null {
  const member = database.prepare(`
    SELECT
      member.id,
      member.userId,
      member.role,
      user.name,
      user.email,
      user.username,
      unifi_person_links.controller_user_id AS controllerUserId
    FROM member
    INNER JOIN user ON user.id = member.userId
    LEFT JOIN unifi_person_links ON unifi_person_links.user_id = user.id
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
      UNION ALL SELECT 1 FROM visitor_households WHERE household_id = ?
    ) AS hasRecords
  `).get(householdId, householdId, householdId, householdId) as { hasRecords: number };
  return Boolean(row.hasRecords);
}
