import "server-only";

import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { database } from "@/lib/database";
import { visibleAccountEmail } from "@/lib/account-email";
import { credentials, gateCodes, member, organization, personPins, unifiPersonLinks, user, visitorHouseholds, visitorPins } from "@/lib/schema";

export type HouseholdMember = {
  id: string;
  userId: string;
  name: string;
  email: string | null;
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
  gateCode: { id: string; pin: string } | null;
};

type MemberRow = Omit<HouseholdMember, "email"> & {
  organizationId: string;
  email: string;
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
    .from(visitorHouseholds)
    .leftJoin(gateCodes, and(
      eq(gateCodes.controllerVisitorId, visitorHouseholds.controllerVisitorId),
      eq(gateCodes.kind, "home"),
    ))
    .where(isNull(gateCodes.id))
    .groupBy(visitorHouseholds.householdId).all();
  const visitorCountByHousehold = new Map(visitorCounts.map((row) => [row.householdId, row.visitorCount]));
  const homeCodeRows = database.select({ householdId: gateCodes.householdId, id: gateCodes.id, pin: gateCodes.pin })
    .from(gateCodes).where(and(eq(gateCodes.kind, "home"), eq(gateCodes.state, "active"))).all();
  const homeCodeByHousehold = new Map(homeCodeRows.map((row) => [row.householdId, { id: row.id, pin: row.pin }]));

  const membersByHousehold = new Map<string, HouseholdMember[]>();
  for (const member of members) {
    const householdMembers = membersByHousehold.get(member.organizationId) ?? [];
    householdMembers.push({
      id: member.id,
      userId: member.userId,
      name: member.name,
      email: visibleAccountEmail(member.email),
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
    gateCode: homeCodeByHousehold.get(household.id) ?? null,
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
  const row = database.select({
    id: member.id,
    userId: member.userId,
    role: member.role,
    name: user.name,
    email: user.email,
    username: user.username,
    controllerUserId: unifiPersonLinks.controllerUserId,
  }).from(member).innerJoin(user, eq(user.id, member.userId))
    .leftJoin(unifiPersonLinks, eq(unifiPersonLinks.userId, user.id))
    .where(and(eq(member.organizationId, householdId), eq(member.id, memberId))).get();
  return row ? { ...row, email: visibleAccountEmail(row.email) } : null;
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
  return [credentials, visitorPins, personPins, visitorHouseholds, gateCodes].some((table) =>
    Boolean(database.select({ householdId: table.householdId }).from(table).where(eq(table.householdId, householdId)).limit(1).get()),
  );
}
