import "server-only";

import { database } from "./database.ts";

export type UnifiServiceAccount = {
  controllerUserId: string;
  label: string;
  markedAt: string;
  markedByUserId: string;
  markedByName: string;
};

type ServiceAccountRow = {
  controllerUserId: string;
  label: string;
  markedAt: string;
  markedByUserId: string;
  markedByName: string;
};

export function listUnifiServiceAccounts(): Map<string, UnifiServiceAccount> {
  const rows = database.prepare(`
    SELECT
      controller_user_id AS controllerUserId,
      label,
      marked_at AS markedAt,
      marked_by_user_id AS markedByUserId,
      marked_by_name AS markedByName
    FROM unifi_service_accounts
    ORDER BY label COLLATE NOCASE
  `).all() as ServiceAccountRow[];
  return new Map(rows.map((row) => [row.controllerUserId, row]));
}

export function markUnifiServiceAccount(input: {
  controllerUserId: string;
  label: string;
  actorUserId: string;
  actorName: string;
}) {
  database.prepare(`
    INSERT INTO unifi_service_accounts
      (controller_user_id, label, marked_at, marked_by_user_id, marked_by_name)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(controller_user_id) DO UPDATE SET
      label = excluded.label,
      marked_at = excluded.marked_at,
      marked_by_user_id = excluded.marked_by_user_id,
      marked_by_name = excluded.marked_by_name
  `).run(input.controllerUserId, input.label.slice(0, 160), new Date().toISOString(), input.actorUserId, input.actorName.slice(0, 160));
}

export function restoreUnifiServiceAccount(controllerUserId: string): boolean {
  return Boolean(database.prepare("DELETE FROM unifi_service_accounts WHERE controller_user_id = ?").run(controllerUserId).changes);
}
