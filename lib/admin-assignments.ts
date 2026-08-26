import "server-only";

import { database } from "@/lib/database";

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

type PersonLinkRow = {
  controllerUserId: string;
  userId: string;
  accountName: string;
  email: string;
  username: string | null;
  householdId: string | null;
  householdName: string | null;
};

export function listPersonLinks(): Map<string, PersonLink> {
  const rows = database.prepare(`
    SELECT
      unifi_person_links.controller_user_id AS controllerUserId,
      user.id AS userId,
      user.name AS accountName,
      user.email,
      user.username,
      organization.id AS householdId,
      organization.name AS householdName
    FROM unifi_person_links
    INNER JOIN user ON user.id = unifi_person_links.user_id
    LEFT JOIN member ON member.userId = user.id
    LEFT JOIN organization ON organization.id = member.organizationId
    ORDER BY user.name COLLATE NOCASE
  `).all() as PersonLinkRow[];

  return new Map(rows.map((row) => [row.controllerUserId, row]));
}

export function listAssignableAccounts(): AssignableAccount[] {
  const rows = database.prepare(`
    SELECT
      user.id,
      user.name,
      user.email,
      user.username,
      organization.id AS householdId,
      organization.name AS householdName
    FROM user
    LEFT JOIN unifi_person_links ON unifi_person_links.user_id = user.id
    LEFT JOIN member ON member.userId = user.id
    LEFT JOIN organization ON organization.id = member.organizationId
    WHERE unifi_person_links.user_id IS NULL
    ORDER BY user.name COLLATE NOCASE, user.email COLLATE NOCASE
  `).all() as AssignableAccount[];

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
  database.prepare(`
    INSERT INTO unifi_person_links (controller_user_id, user_id, linked_at)
    VALUES (?, ?, ?)
  `).run(controllerUserId, userId, new Date().toISOString());
}

export function assignPersonRecords(controllerUserId: string, householdId: string) {
  database.prepare("UPDATE person_pins SET household_id = ? WHERE controller_user_id = ?").run(householdId, controllerUserId);
}

export function unlinkUnifiPerson(controllerUserId: string) {
  database.prepare("DELETE FROM unifi_person_links WHERE controller_user_id = ?").run(controllerUserId);
}

export function getPersonLink(controllerUserId: string): PersonLink | null {
  return listPersonLinks().get(controllerUserId) ?? null;
}

export function listVisitorHouseholds(): Map<string, VisitorHousehold> {
  const rows = database.prepare(`
    SELECT
      visitor_households.controller_visitor_id AS controllerVisitorId,
      organization.id AS householdId,
      organization.name AS householdName
    FROM visitor_households
    INNER JOIN organization ON organization.id = visitor_households.household_id
  `).all() as Array<VisitorHousehold & { controllerVisitorId: string }>;
  return new Map(rows.map((row) => [row.controllerVisitorId, row]));
}

export function getVisitorHousehold(controllerVisitorId: string): VisitorHousehold | null {
  return listVisitorHouseholds().get(controllerVisitorId) ?? null;
}

export function assignVisitorToHousehold(controllerVisitorId: string, householdId: string) {
  const assignedAt = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      INSERT INTO visitor_households (controller_visitor_id, household_id, assigned_at)
      VALUES (?, ?, ?)
      ON CONFLICT(controller_visitor_id) DO UPDATE SET
        household_id = excluded.household_id,
        assigned_at = excluded.assigned_at
    `).run(controllerVisitorId, householdId, assignedAt);
    database.prepare("UPDATE credentials SET household_id = ? WHERE controller_visitor_id = ?").run(householdId, controllerVisitorId);
    database.prepare("UPDATE visitor_pins SET household_id = ? WHERE controller_visitor_id = ?").run(householdId, controllerVisitorId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
