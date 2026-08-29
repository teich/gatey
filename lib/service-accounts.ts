import "server-only";

import { asc, eq, sql } from "drizzle-orm";
import { database } from "./database.ts";
import { unifiServiceAccounts } from "./schema.ts";

export type UnifiServiceAccount = {
  controllerUserId: string;
  label: string;
  markedAt: string;
  markedByUserId: string;
  markedByName: string;
};

export function listUnifiServiceAccounts(): Map<string, UnifiServiceAccount> {
  const rows = database.select().from(unifiServiceAccounts)
    .orderBy(asc(sql`${unifiServiceAccounts.label} collate nocase`)).all();
  return new Map(rows.map((row) => [row.controllerUserId, row]));
}

export function markUnifiServiceAccount(input: {
  controllerUserId: string;
  label: string;
  actorUserId: string;
  actorName: string;
}) {
  const values = {
    controllerUserId: input.controllerUserId,
    label: input.label.slice(0, 160),
    markedAt: new Date().toISOString(),
    markedByUserId: input.actorUserId,
    markedByName: input.actorName.slice(0, 160),
  };
  database.insert(unifiServiceAccounts).values(values).onConflictDoUpdate({
    target: unifiServiceAccounts.controllerUserId,
    set: values,
  }).run();
}

export function restoreUnifiServiceAccount(controllerUserId: string): boolean {
  return Boolean(database.delete(unifiServiceAccounts).where(eq(unifiServiceAccounts.controllerUserId, controllerUserId)).run().changes);
}
