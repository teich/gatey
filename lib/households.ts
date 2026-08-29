import "server-only";

import { and, asc, count, eq, sql } from "drizzle-orm";
import { database } from "@/lib/database";
import { credentials, member, organization, personPins, unifiPersonLinks, user, visitorHouseholds, visitorPins } from "@/lib/schema";

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

type MemberRow = HouseholdMember & {
  organizationId: string;
};

export function listHouseholds(): HouseholdAdminRecord[] {
  const households = database.select({ id: organization.id, name: organization.name, slug: organization.slug })
    .from(organization).orderBy(sql`${organization.name} collate nocase`, asc(organization.createdAt)).all();
  const members: MemberRow[] = database.select({
    id: member.id,
    organizationId: member.organizationId,
    userId: member.userId,
    role: member.role,
    name: user.name,
    email: user.email,
    username: user.username,
    controllerUserId: unifiPersonLinks.controllerUserId,
  }).from(member).innerJoin(user, eq(user.id, member.userId))
    .leftJoin(unifiPersonLinks, eq(unifiPersonLinks.userId, user.id))
    .orderBy(sql`${user.name} collate nocase`, sql`${user.email} collate nocase`).all();
  const visitorCounts = database.select({ householdId: visitorHouseholds.householdId, visitorCount: count() })
    .from(visitorHouseholds).groupBy(visitorHouseholds.householdId).all();
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
  database.update(organization).set(input).where(eq(organization.id, id)).run();
  return getHousehold(id);
}

export function deleteHousehold(id: string) {
  database.delete(organization).where(eq(organization.id, id)).run();
}

// Better Auth creates an organization with the caller as a member. Gatey
// households are administered separately, so a newly-created household is
// intentionally left empty until a resident is added.
export function removeCreatorFromHousehold(householdId: string, userId: string) {
  database.delete(member).where(and(eq(member.organizationId, householdId), eq(member.userId, userId))).run();
}

export function getHouseholdMember(householdId: string, memberId: string): HouseholdMember | null {
  return database.select({
    id: member.id,
    userId: member.userId,
    role: member.role,
    name: user.name,
    email: user.email,
    username: user.username,
    controllerUserId: unifiPersonLinks.controllerUserId,
  }).from(member).innerJoin(user, eq(user.id, member.userId))
    .leftJoin(unifiPersonLinks, eq(unifiPersonLinks.userId, user.id))
    .where(and(eq(member.organizationId, householdId), eq(member.id, memberId))).get() ?? null;
}

export function getUserByEmail(email: string): { id: string; name: string; email: string; username: string | null } | null {
  return database.select({ id: user.id, name: user.name, email: user.email, username: user.username })
    .from(user).where(sql`lower(${user.email}) = lower(${email})`).get() ?? null;
}

export function getUserHousehold(userId: string): { id: string; name: string } | null {
  return database.select({ id: organization.id, name: organization.name }).from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId)).limit(1).get() ?? null;
}

export function householdHasGateyRecords(householdId: string): boolean {
  return [credentials, visitorPins, personPins, visitorHouseholds].some((table) =>
    Boolean(database.select({ householdId: table.householdId }).from(table).where(eq(table.householdId, householdId)).limit(1).get()),
  );
}
