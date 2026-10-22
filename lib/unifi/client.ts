import "server-only";

import { Agent, request as httpsRequest } from "node:https";
import { envFlag } from "@/lib/env";

type ApiResponse<T> = {
  code?: string;
  data?: T;
  msg?: string;
  message?: string;
  pagination?: { page_num?: number; page_size?: number; total?: number };
};

const insecureUnifiAgent = new Agent({ rejectUnauthorized: false });
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export function assertControllerChangesAllowed() {
  if (envFlag("GATEY_UNIFI_WRITES")) return;
  throw new Error("UniFi changes are enabled only on Gatey's production server.");
}

export function timestampToIso(timestamp?: number): string | undefined {
  if (typeof timestamp !== "number") return undefined;
  const milliseconds = timestamp > 100_000_000_000 ? timestamp : timestamp * 1_000;
  return new Date(milliseconds).toISOString();
}

export function unifiConfig() {
  const host = process.env.UNIFI_HOST;
  const token = process.env.UNIFI_ACCESS_API_TOKEN;
  if (!host || !token) throw new Error("Gatey is missing its UniFi connection settings.");
  return {
    baseUrl: `https://${host}:${process.env.UNIFI_ACCESS_PORT || "12445"}/api/v1/developer`,
    token,
    doorName: (process.env.UNIFI_DOOR_NAME || "Gate").trim(),
    insecureTls: envFlag("UNIFI_INSECURE_TLS"),
  };
}

async function unifiFetch(url: string, init: RequestInit, insecureTls: boolean): Promise<Response> {
  if (!insecureTls) return fetch(url, init);

  const body = init.body;
  if (body && typeof body !== "string" && !(body instanceof Uint8Array)) {
    throw new Error("UniFi requests only support string or byte request bodies.");
  }

  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, {
      method: init.method,
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      agent: insecureUnifiAgent,
      signal: init.signal ?? undefined,
    }, (response) => {
      const chunks: Uint8Array[] = [];
      response.on("data", (chunk: Uint8Array) => chunks.push(chunk));
      response.on("end", () => {
        resolve(new Response(new Uint8Array(Buffer.concat(chunks)), {
          status: response.statusCode || 500,
          headers: response.headers as HeadersInit,
        }));
      });
    });
    request.on("error", reject);
    request.end(body || undefined);
  });
}

export async function requestEnvelope<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const { baseUrl, token, insecureTls } = unifiConfig();
  const signal = init.signal ?? AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS);
  const response = await unifiFetch(`${baseUrl}${path}`, {
    ...init,
    signal,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init.headers || {}) },
    cache: "no-store",
  }, insecureTls);
  const body = await response.json().catch(() => ({})) as ApiResponse<T>;
  if (!response.ok || !["SUCCESS", "OK"].includes(String(body.code || "").toUpperCase())) {
    throw new Error(body.msg || body.message || body.code || `UniFi request failed (${response.status})`);
  }
  return body;
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await requestEnvelope<T>(path, init)).data as T;
}

export function jsonBody(body: unknown): RequestInit {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
