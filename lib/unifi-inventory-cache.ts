import "server-only";

import { eq } from "drizzle-orm";
import { database } from "@/lib/database";
import { unifiInventorySnapshot } from "@/lib/schema";
import {
  listUserInventory,
  listVisitorInventory,
  type UserInventoryItem,
  type VisitorInventoryItem,
} from "@/lib/unifi-access";

const SNAPSHOT_ID = 1;
const REFRESH_COOLDOWN_MS = 30_000;

export type InventorySnapshot = {
  users: UserInventoryItem[];
  visitors: VisitorInventoryItem[];
  version: number;
  lastSucceededAt?: string;
  lastError?: string;
};

export type InventoryRefreshResult = {
  changed: boolean;
  usersChanged: boolean;
  visitorsChanged: boolean;
  recovered: boolean;
  version: number;
  skipped?: boolean;
};

function parseArray<T>(value?: string): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function readSnapshotRow() {
  return database.select().from(unifiInventorySnapshot)
    .where(eq(unifiInventorySnapshot.id, SNAPSHOT_ID)).get();
}

export function getUnifiInventorySnapshot(): InventorySnapshot {
  const row = readSnapshotRow();
  if (!row) return { users: [], visitors: [], version: 0 };
  return {
    users: parseArray<UserInventoryItem>(row.usersJson),
    visitors: parseArray<VisitorInventoryItem>(row.visitorsJson),
    version: row.version,
    ...(row.lastSucceededAt ? { lastSucceededAt: row.lastSucceededAt } : {}),
    ...(row.lastError ? { lastError: row.lastError } : {}),
  };
}

function normalizeUsers(users: UserInventoryItem[]) {
  return users.map((user) => ({ ...user, policyNames: [...user.policyNames].sort() }));
}

function normalizeVisitors(visitors: VisitorInventoryItem[]) {
  return visitors.map((visitor) => ({ ...visitor, resources: [...visitor.resources].sort() }));
}

async function performRefresh(): Promise<InventoryRefreshResult> {
  const attemptedAt = new Date().toISOString();
  try {
    const [visitors, users] = await Promise.all([listVisitorInventory(), listUserInventory()]);
    const usersJson = JSON.stringify(normalizeUsers(users));
    const visitorsJson = JSON.stringify(normalizeVisitors(visitors));

    return database.transaction((tx) => {
      const previous = tx.select().from(unifiInventorySnapshot)
        .where(eq(unifiInventorySnapshot.id, SNAPSHOT_ID)).get();
      const usersChanged = previous?.usersJson !== usersJson;
      const visitorsChanged = previous?.visitorsJson !== visitorsJson;
      const changed = usersChanged || visitorsChanged;
      const recovered = Boolean(previous?.lastError);
      const version = (previous?.version ?? 0) + (changed ? 1 : 0);
      const values = {
        usersJson,
        visitorsJson,
        version,
        lastAttemptedAt: attemptedAt,
        lastSucceededAt: attemptedAt,
        lastChangedAt: changed ? attemptedAt : previous?.lastChangedAt ?? null,
        lastError: "",
        updatedAt: attemptedAt,
      };
      tx.insert(unifiInventorySnapshot).values({ id: SNAPSHOT_ID, ...values })
        .onConflictDoUpdate({ target: unifiInventorySnapshot.id, set: values }).run();
      return { changed, usersChanged, visitorsChanged, recovered, version };
    }, { behavior: "immediate" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read UniFi Access.";
    database.insert(unifiInventorySnapshot).values({
      id: SNAPSHOT_ID,
      lastAttemptedAt: attemptedAt,
      lastError: message,
      updatedAt: attemptedAt,
    }).onConflictDoUpdate({
      target: unifiInventorySnapshot.id,
      set: { lastAttemptedAt: attemptedAt, lastError: message, updatedAt: attemptedAt },
    }).run();
    throw error;
  }
}

const globalForInventory = globalThis as unknown as {
  gateyInventoryRefresh?: Promise<InventoryRefreshResult>;
};

export function refreshUnifiInventory(options: { force?: boolean } = {}) {
  if (globalForInventory.gateyInventoryRefresh) return globalForInventory.gateyInventoryRefresh;

  const row = readSnapshotRow();
  const lastAttempt = row?.lastAttemptedAt ? Date.parse(row.lastAttemptedAt) : 0;
  if (!options.force && lastAttempt && Date.now() - lastAttempt < REFRESH_COOLDOWN_MS) {
    return Promise.resolve({
      changed: false,
      usersChanged: false,
      visitorsChanged: false,
      recovered: false,
      version: row?.version ?? 0,
      skipped: true,
    });
  }

  const refresh = performRefresh().finally(() => {
    if (globalForInventory.gateyInventoryRefresh === refresh) {
      globalForInventory.gateyInventoryRefresh = undefined;
    }
  });
  globalForInventory.gateyInventoryRefresh = refresh;
  return refresh;
}
