import "server-only";

import { jsonBody, request, requestEnvelope, timestampToIso } from "./client";

type UnifiSystemLog = {
  "@timestamp"?: string;
  _id?: string;
  _source?: {
    actor?: {
      id?: string;
      type?: string;
      display_name?: string;
      alternate_name?: string;
    };
    authentication?: {
      credential_provider?: string;
      issuer?: string;
    };
    event?: {
      published?: number;
      result?: string;
      type?: string;
      display_message?: string;
      reason?: string;
    };
    target?: Array<{
      id?: string;
      type?: string;
      display_name?: string;
    }>;
  };
};

export type UnifiAccessLogPage = {
  hits: UnifiSystemLog[];
  pageNum: number;
  pageSize: number;
  total: number;
};

const CREDENTIAL_LAST_USE_TTL_MS = 60_000;

const globalForLogs = globalThis as unknown as {
  gateyCredentialLastUses?: Map<string, { value: string | undefined; expiresAt: number }>;
};

export async function fetchAccessLogPage(input: {
  since: number;
  until: number;
  pageNum: number;
  pageSize?: number;
}): Promise<UnifiAccessLogPage> {
  const pageNum = Math.max(1, Math.floor(input.pageNum));
  const pageSize = Math.max(1, Math.min(100, Math.floor(input.pageSize || 100)));
  const response = await requestEnvelope<{ hits?: UnifiSystemLog[] }>(
    `/system/logs?page_num=${pageNum}&page_size=${pageSize}`,
    {
      method: "POST",
      ...jsonBody({
        topic: "door_openings",
        since: Math.floor(input.since),
        until: Math.floor(input.until),
      }),
    },
  );
  return {
    hits: response.data?.hits || [],
    pageNum: response.pagination?.page_num || pageNum,
    pageSize: response.pagination?.page_size || pageSize,
    total: response.pagination?.total || 0,
  };
}

export async function getCredentialLastUse(
  visitorId: string,
  startsAt: string,
  endsAt: string,
): Promise<string | undefined> {
  const cached = globalForLogs.gateyCredentialLastUses?.get(visitorId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return undefined;

  const logs = await request<{ hits?: UnifiSystemLog[] }>("/system/logs?page_num=1&page_size=100", {
    method: "POST",
    ...jsonBody({
      topic: "door_openings",
      since: Math.floor(start.getTime() / 1_000),
      until: Math.floor(Math.min(end.getTime(), Date.now()) / 1_000),
      actor_id: visitorId,
    }),
  });

  // Denied attempts are intentionally not presented as a use of the code.
  const hit = logs.hits?.find(
    (item) => !["BLOCKED", "DENIED", "FAILED"].includes(String(item._source?.event?.result || "").toUpperCase()),
  );
  const value = timestampToIso(hit?._source?.event?.published);
  const cache =
    globalForLogs.gateyCredentialLastUses ?? new Map<string, { value: string | undefined; expiresAt: number }>();
  cache.set(visitorId, { value, expiresAt: Date.now() + CREDENTIAL_LAST_USE_TTL_MS });
  globalForLogs.gateyCredentialLastUses = cache;
  return value;
}
