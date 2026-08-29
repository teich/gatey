import "server-only";

import { eq } from "drizzle-orm";
import { database, sqlite } from "@/lib/database";
import { credentials, gateCodes, unifiAccessEvents, unifiAccessSyncState, unifiActorLinks } from "@/lib/schema";
import { fetchAccessLogPage, getConfiguredGateIdentity } from "@/lib/unifi-access";

const SYNC_STATE_ID = 1;
const PAGE_SIZE = 100;
const OVERLAP_SECONDS = 10 * 60;
const DEFAULT_HISTORY_START = "2020-01-01T00:00:00.000Z";
const USAGE_WINDOW_DAYS = 90;
const WEEK_BUCKETS = 8;

type SyncStateRow = typeof unifiAccessSyncState.$inferSelect;
type UsageRow = { key: string; occurred_at: string };

export type AccessUsageSummary = {
  useCount: number;
  usageWindowDays: number;
  lastUsedAt?: string;
  weeklyUses: number[];
  known: boolean;
  coverageStartsAt?: string;
};

export type AccessSyncStatus = {
  state: "idle" | "running" | "succeeded" | "failed";
  coverageStartsAt?: string;
  completeThrough?: string;
  lastStartedAt?: string;
  lastSucceededAt?: string;
  lastError?: string;
};

export type AccessActivityItem = {
  id: string;
  occurredAt: string;
  actorId?: string;
  actorName: string;
  actorType: string;
  actorKind: "person" | "service_account" | "managed_code" | "visitor" | "other";
  householdName?: string;
  subjectLabel?: string;
  subjectType?: string;
  credentialProvider: string;
  result: string;
  displayMessage: string;
  reason: string;
  doorName: string;
  attributable: boolean;
};

const globalForAccessSync = globalThis as unknown as {
  gateyAccessSyncPromise?: Promise<{ imported: number; total: number; completeThrough: string }>;
};

function currentSyncState(): SyncStateRow | undefined {
  return database.select().from(unifiAccessSyncState).where(eq(unifiAccessSyncState.id, SYNC_STATE_ID)).get();
}

export function getAccessSyncStatus(): AccessSyncStatus {
  const row = currentSyncState();
  return {
    state: row?.state || "idle",
    ...(row?.coverageStartsAt ? { coverageStartsAt: row.coverageStartsAt } : {}),
    ...(row?.completeThrough ? { completeThrough: row.completeThrough } : {}),
    ...(row?.lastStartedAt ? { lastStartedAt: row.lastStartedAt } : {}),
    ...(row?.lastSucceededAt ? { lastSucceededAt: row.lastSucceededAt } : {}),
    ...(row?.lastError ? { lastError: row.lastError } : {}),
  };
}

function saveSyncState(values: Partial<typeof unifiAccessSyncState.$inferInsert>) {
  const now = new Date().toISOString();
  database.insert(unifiAccessSyncState).values({
    id: SYNC_STATE_ID,
    state: "idle",
    lastError: "",
    updatedAt: now,
    ...values,
  }).onConflictDoUpdate({
    target: unifiAccessSyncState.id,
    set: { ...values, updatedAt: now },
  }).run();
}

function configuredHistoryStart(): Date {
  const candidate = new Date(process.env.GATEY_ACCESS_HISTORY_START || DEFAULT_HISTORY_START);
  return Number.isNaN(candidate.valueOf()) ? new Date(DEFAULT_HISTORY_START) : candidate;
}

function publishedAt(log: Awaited<ReturnType<typeof fetchAccessLogPage>>["hits"][number]): string | undefined {
  const published = log._source?.event?.published;
  if (typeof published === "number") {
    const milliseconds = published > 100_000_000_000 ? published : published * 1_000;
    return new Date(milliseconds).toISOString();
  }
  if (!log["@timestamp"]) return undefined;
  const timestamp = new Date(log["@timestamp"]);
  return Number.isNaN(timestamp.valueOf()) ? undefined : timestamp.toISOString();
}

async function runAccessSync() {
  const startedAt = new Date();
  const previous = currentSyncState();
  const previousComplete = previous?.completeThrough ? new Date(previous.completeThrough) : undefined;
  const since = previousComplete && !Number.isNaN(previousComplete.valueOf())
    ? new Date(previousComplete.getTime() - OVERLAP_SECONDS * 1_000)
    : configuredHistoryStart();
  const until = startedAt;
  saveSyncState({ state: "running", lastStartedAt: startedAt.toISOString(), lastError: "" });

  try {
    const gate = await getConfiguredGateIdentity();
    let pageNum = 1;
    let total = 0;
    let imported = 0;
    let earliest: string | undefined;

    do {
      const page = await fetchAccessLogPage({
        since: Math.floor(since.getTime() / 1_000),
        until: Math.floor(until.getTime() / 1_000),
        pageNum,
        pageSize: PAGE_SIZE,
      });
      total = page.total;
      const receivedAt = new Date().toISOString();
      const rows = page.hits.flatMap((log) => {
        const id = log._id;
        const occurredAt = publishedAt(log);
        const source = log._source;
        const event = source?.event;
        const door = source?.target?.find((target) => target.type === "door" && target.id === gate.id);
        if (!id || !occurredAt || !door || event?.type !== "access.door.unlock") return [];
        if (!earliest || occurredAt < earliest) earliest = occurredAt;
        const activityResource = source?.target?.find((target) => target.type === "activities_resource");
        return [{
          id,
          occurredAt,
          actorControllerId: source?.actor?.id || null,
          actorType: source?.actor?.type || "",
          actorDisplayName: source?.actor?.display_name || source?.actor?.alternate_name || "",
          credentialProvider: source?.authentication?.credential_provider || "",
          eventType: event.type,
          result: event.result || "",
          displayMessage: event.display_message || "",
          reason: event.reason || "",
          doorId: door.id || gate.id,
          doorName: door.display_name || gate.name,
          activityResourceId: activityResource?.id || null,
          receivedAt,
        }];
      });

      database.transaction((tx) => {
        for (const row of rows) {
          const { id, ...values } = row;
          tx.insert(unifiAccessEvents).values({ id, ...values }).onConflictDoUpdate({
            target: unifiAccessEvents.id,
            set: values,
          }).run();
        }
      }, { behavior: "immediate" });
      imported += rows.length;
      pageNum += 1;
    } while ((pageNum - 1) * PAGE_SIZE < total);

    const coverageStartsAt = [previous?.coverageStartsAt, earliest]
      .filter((value): value is string => Boolean(value)).sort()[0];
    saveSyncState({
      state: "succeeded",
      ...(coverageStartsAt ? { coverageStartsAt } : {}),
      completeThrough: until.toISOString(),
      lastSucceededAt: new Date().toISOString(),
      lastError: "",
    });
    return { imported, total, completeThrough: until.toISOString() };
  } catch (error) {
    saveSyncState({
      state: "failed",
      lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown UniFi access-history error",
    });
    throw error;
  }
}

export function syncAccessHistory() {
  if (globalForAccessSync.gateyAccessSyncPromise) return globalForAccessSync.gateyAccessSyncPromise;
  const promise = runAccessSync().finally(() => {
    delete globalForAccessSync.gateyAccessSyncPromise;
  });
  globalForAccessSync.gateyAccessSyncPromise = promise;
  return promise;
}

function emptyUsageSummary(status: AccessSyncStatus, windowDays: number): AccessUsageSummary {
  return {
    useCount: 0,
    usageWindowDays: windowDays,
    weeklyUses: Array.from({ length: WEEK_BUCKETS }, () => 0),
    known: Boolean(status.lastSucceededAt),
    ...(status.coverageStartsAt ? { coverageStartsAt: status.coverageStartsAt } : {}),
  };
}

function summarizeUsage(rows: UsageRow[], keys: string[], windowDays: number) {
  const status = getAccessSyncStatus();
  const result = new Map(keys.map((key) => [key, emptyUsageSummary(status, windowDays)]));
  const weeklyStart = Date.now() - WEEK_BUCKETS * 7 * 86_400_000;
  for (const row of rows) {
    const summary = result.get(row.key);
    if (!summary) continue;
    summary.useCount += 1;
    if (!summary.lastUsedAt || row.occurred_at > summary.lastUsedAt) summary.lastUsedAt = row.occurred_at;
    const occurred = new Date(row.occurred_at).getTime();
    if (occurred >= weeklyStart) {
      const index = Math.min(WEEK_BUCKETS - 1, Math.max(0, Math.floor((occurred - weeklyStart) / (7 * 86_400_000))));
      summary.weeklyUses[index] += 1;
    }
  }
  return result;
}

export function listActorUsageSummaries(actorIds: string[], windowDays = USAGE_WINDOW_DAYS) {
  const uniqueIds = [...new Set(actorIds.filter(Boolean))];
  if (!uniqueIds.length) return new Map<string, AccessUsageSummary>();
  const placeholders = uniqueIds.map(() => "?").join(",");
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const rows = sqlite.prepare(`
    select coalesce(current_link.controller_actor_id, events.actor_controller_id) as key,
      events.occurred_at
    from unifi_access_events events
    left join unifi_actor_links historical_link
      on historical_link.controller_actor_id = events.actor_controller_id
    left join unifi_actor_links current_link
      on current_link.subject_type = historical_link.subject_type
      and current_link.subject_id = historical_link.subject_id
      and current_link.role = 'current'
    where coalesce(current_link.controller_actor_id, events.actor_controller_id) in (${placeholders})
      and events.event_type = 'access.door.unlock'
      and events.result = 'ACCESS'
      and events.credential_provider = 'PIN_CODE'
      and events.occurred_at >= ?
    order by events.occurred_at desc
  `).all(...uniqueIds, since) as unknown as UsageRow[];
  return summarizeUsage(rows, uniqueIds, windowDays);
}

export function listGateCodeUsageSummaries(householdId: string, windowDays = USAGE_WINDOW_DAYS) {
  const codeIds = database.select({ id: gateCodes.id }).from(gateCodes)
    .where(eq(gateCodes.householdId, householdId)).all().map((row) => row.id);
  if (!codeIds.length) return new Map<string, AccessUsageSummary>();
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const rows = sqlite.prepare(`
    select links.subject_id as key, events.occurred_at
    from unifi_actor_links links
    join unifi_access_events events on events.actor_controller_id = links.controller_actor_id
    where links.subject_type = 'gate_code'
      and links.household_id = ?
      and events.event_type = 'access.door.unlock'
      and events.result = 'ACCESS'
      and events.credential_provider = 'PIN_CODE'
      and events.occurred_at >= ?
    order by events.occurred_at desc
  `).all(householdId, since) as unknown as UsageRow[];
  return summarizeUsage(rows, codeIds, windowDays);
}

export function seedExistingActorLinks() {
  const now = new Date().toISOString();
  const currentCodes = database.select().from(gateCodes).all().map((code) => ({
    controllerActorId: code.controllerVisitorId,
    actorType: "visitor",
    subjectType: "gate_code" as const,
    subjectId: code.id,
    householdId: code.householdId,
    label: code.label,
    role: "current" as const,
    linkedAt: now,
  }));
  const legacyCredentials = database.select().from(credentials).all().map((credential) => ({
    controllerActorId: credential.controllerVisitorId,
    actorType: "visitor",
    subjectType: "credential" as const,
    subjectId: credential.id,
    householdId: credential.householdId,
    label: credential.label,
    role: "current" as const,
    linkedAt: now,
  }));
  database.transaction((tx) => {
    for (const values of [...currentCodes, ...legacyCredentials]) {
      tx.insert(unifiActorLinks).values(values).onConflictDoNothing().run();
    }
  }, { behavior: "immediate" });
}

export function listAccessActivity(limit = 250): AccessActivityItem[] {
  const rows = sqlite.prepare(`
    select events.id, events.occurred_at, events.actor_controller_id, events.actor_display_name, events.actor_type,
      events.credential_provider, events.result, events.display_message, events.reason,
      events.door_name, links.subject_type, links.label as subject_label,
      service_account.label as service_account_label,
      gatey_user.id as person_user_id,
      visitor_link.controller_visitor_id as visitor_controller_visitor_id,
      coalesce(link_household.name, visitor_household.name, person_household.name) as household_name
    from unifi_access_events events
    left join unifi_actor_links links on links.controller_actor_id = events.actor_controller_id
    left join unifi_service_accounts service_account on service_account.controller_user_id = events.actor_controller_id
    left join organization link_household on link_household.id = links.household_id
    left join visitor_households visitor_link on visitor_link.controller_visitor_id = events.actor_controller_id
    left join organization visitor_household on visitor_household.id = visitor_link.household_id
    left join unifi_person_links person_link on person_link.controller_user_id = events.actor_controller_id
    left join user gatey_user on gatey_user.id = coalesce(person_link.user_id, events.actor_controller_id)
    left join member person_member on person_member.user_id = gatey_user.id
    left join organization person_household on person_household.id = person_member.organization_id
    group by events.id
    order by events.occurred_at desc
    limit ?
  `).all(Math.max(1, Math.min(limit, 500))) as unknown as Array<Record<string, string | null>>;
  return rows.map((row) => {
    const actorKind: AccessActivityItem["actorKind"] = row.service_account_label
      ? "service_account"
      : row.subject_type
        ? "managed_code"
        : row.person_user_id
          ? "person"
          : row.visitor_controller_visitor_id || row.actor_type === "visitor"
            ? "visitor"
            : "other";
    return {
      id: String(row.id),
      occurredAt: String(row.occurred_at),
      ...(row.actor_controller_id ? { actorId: String(row.actor_controller_id) } : {}),
      actorName: String(row.subject_label || row.service_account_label || row.actor_display_name || "Unknown"),
      actorType: String(row.actor_type || ""),
      actorKind,
      ...(row.household_name ? { householdName: String(row.household_name) } : {}),
      ...(row.subject_label ? { subjectLabel: String(row.subject_label) } : {}),
      ...(row.subject_type ? { subjectType: String(row.subject_type) } : {}),
      credentialProvider: String(row.credential_provider || ""),
      result: String(row.result || ""),
      displayMessage: String(row.display_message || ""),
      reason: String(row.reason || ""),
      doorName: String(row.door_name || "Gate"),
      attributable: Boolean(row.subject_label || row.person_user_id || row.household_name || row.service_account_label),
    };
  });
}

export function accessActivityTotals(windowDays = 30) {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const row = sqlite.prepare(`
    select count(*) as total,
      sum(case when result = 'ACCESS' then 1 else 0 end) as granted,
      sum(case when result = 'BLOCKED' then 1 else 0 end) as blocked,
      sum(case when result = 'ACCESS' and credential_provider = 'PIN_CODE' then 1 else 0 end) as pin_uses
    from unifi_access_events where occurred_at >= ?
  `).get(since) as unknown as Record<string, number | null>;
  return {
    windowDays,
    total: Number(row?.total || 0),
    granted: Number(row?.granted || 0),
    blocked: Number(row?.blocked || 0),
    pinUses: Number(row?.pin_uses || 0),
  };
}
