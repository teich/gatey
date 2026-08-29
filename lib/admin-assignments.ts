import "server-only";

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { database } from "./database.ts";
import { credentials, member, organization, personPins, session, unifiPersonLinks, user, visitorHouseholds, visitorPins } from "./schema.ts";

export type PersonLink = {
  controllerUserId: string;
  userId: string;
  accountName: string;
  email: string;
  username: string | null;
  householdId: string | null;
  householdName: string | null;
};

export type AssignableAccount = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  householdId: string | null;
  householdName: string | null;
};

export type VisitorHousehold = {
  householdId: string;
  householdName: string;
};

export function listPersonLinks(): Map<string, PersonLink> {
  const rows = database.select({
    controllerUserId: unifiPersonLinks.controllerUserId,
    userId: user.id,
    accountName: user.name,
    email: user.email,
    username: user.username,
    householdId: organization.id,
    householdName: organization.name,
  }).from(unifiPersonLinks).innerJoin(user, eq(user.id, unifiPersonLinks.userId))
    .leftJoin(member, eq(member.userId, user.id))
    .leftJoin(organization, eq(organization.id, member.organizationId))
    .orderBy(sql`${user.name} collate nocase`).all();

  return new Map(rows.map((row) => [row.controllerUserId, row]));
}

export function listAssignableAccounts(): AssignableAccount[] {
  const rows = database.select({
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    householdId: organization.id,
    householdName: organization.name,
  }).from(user).leftJoin(unifiPersonLinks, eq(unifiPersonLinks.userId, user.id))
    .leftJoin(member, eq(member.userId, user.id))
    .leftJoin(organization, eq(organization.id, member.organizationId))
    .where(sql`${unifiPersonLinks.userId} is null`)
    .orderBy(sql`${user.name} collate nocase`, sql`${user.email} collate nocase`).all();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    username: row.username,
    householdId: row.householdId,
    householdName: row.householdName,
  }));
}

export function linkUnifiPerson(controllerUserId: string, userId: string) {
  database.insert(unifiPersonLinks).values({ controllerUserId, userId, linkedAt: new Date().toISOString() }).run();
}

export function assignPersonRecords(controllerUserId: string, householdId: string) {
  database.update(personPins).set({ householdId }).where(eq(personPins.controllerUserId, controllerUserId)).run();
}

function personHouseholdMove(userId: string, householdId: string) {
  const target = database.select({ id: organization.id }).from(organization).where(eq(organization.id, householdId)).get();
  if (!target) throw new Error("Household not found.");

  const memberships = database.select({ id: member.id, organizationId: member.organizationId, role: member.role })
    .from(member).where(eq(member.userId, userId)).all();
  if (memberships.length > 1) throw new Error("This account belongs to more than one household. Resolve its memberships before moving it.");
  const current = memberships[0];
  if (current?.organizationId === householdId) return { current, changeRequired: false };
  if (current?.role.split(",").includes("owner")) throw new Error("Household owners cannot be moved until ownership is transferred.");
  return { current, changeRequired: true };
}

export function validatePersonHouseholdReassignment(userId: string, householdId: string) {
  personHouseholdMove(userId, householdId);
}

export function reassignPersonHousehold(controllerUserId: string, userId: string, householdId: string) {
  const { current, changeRequired } = personHouseholdMove(userId, householdId);
  if (!changeRequired) return;

  database.transaction((tx) => {
    if (current) {
      tx.update(member).set({ organizationId: householdId }).where(eq(member.id, current.id)).run();
    } else {
      tx.insert(member).values({ id: randomUUID(), organizationId: householdId, userId, role: "member", createdAt: new Date() }).run();
    }
    tx.update(personPins).set({ householdId }).where(eq(personPins.controllerUserId, controllerUserId)).run();
    tx.update(session).set({ activeOrganizationId: householdId }).where(eq(session.userId, userId)).run();
  }, { behavior: "immediate" });
}

export function unlinkUnifiPerson(controllerUserId: string) {
  database.delete(unifiPersonLinks).where(eq(unifiPersonLinks.controllerUserId, controllerUserId)).run();
}

export function getPersonLink(controllerUserId: string): PersonLink | null {
  return listPersonLinks().get(controllerUserId) ?? null;
}

export function listVisitorHouseholds(): Map<string, VisitorHousehold> {
  const rows = database.select({ controllerVisitorId: visitorHouseholds.controllerVisitorId, householdId: organization.id, householdName: organization.name })
    .from(visitorHouseholds).innerJoin(organization, eq(organization.id, visitorHouseholds.householdId)).all();
  return new Map(rows.map((row) => [row.controllerVisitorId, row]));
}

export function getVisitorHousehold(controllerVisitorId: string): VisitorHousehold | null {
  return listVisitorHouseholds().get(controllerVisitorId) ?? null;
}

export function assignVisitorToHousehold(controllerVisitorId: string, householdId: string) {
  const assignedAt = new Date().toISOString();
  database.transaction((tx) => {
    tx.insert(visitorHouseholds).values({ controllerVisitorId, householdId, assignedAt })
      .onConflictDoUpdate({ target: visitorHouseholds.controllerVisitorId, set: { householdId, assignedAt } }).run();
    tx.update(credentials).set({ householdId }).where(eq(credentials.controllerVisitorId, controllerVisitorId)).run();
    tx.update(visitorPins).set({ householdId }).where(eq(visitorPins.controllerVisitorId, controllerVisitorId)).run();
  }, { behavior: "immediate" });
}
