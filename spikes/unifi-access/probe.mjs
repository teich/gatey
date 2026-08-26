#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { Agent, request as httpsRequest } from "node:https";
import { resolve } from "node:path";

const host = process.env.UNIFI_HOST;
const token = process.env.UNIFI_ACCESS_API_TOKEN;
const port = process.env.UNIFI_ACCESS_PORT || "12445";
const insecure = ["1", "true", "yes"].includes((process.env.UNIFI_INSECURE_TLS || "").toLowerCase());
const writeFixture = process.argv.includes("--write-fixture");

if (!host || !token) {
  console.error("UNIFI_HOST and UNIFI_ACCESS_API_TOKEN are required.");
  console.error("Use the same runtime values as phone-gate-bridge; never put the token in this repository.");
  process.exit(1);
}

const insecureUnifiAgent = new Agent({ rejectUnauthorized: false });

const baseUrl = `https://${host}:${port}`;
const endpoints = [
  "/api/v1/developer/doors",
  "/api/v1/developer/openapi.json",
  "/api/v1/developer/swagger.json",
  "/api/v1/developer/visitors",
  "/api/v1/developer/credentials/pin_codes",
  "/api/v1/developer/door_groups/topology",
  "/api/v1/developer/visitor_schedules",
  "/api/v1/developer/visitor-schedules",
];

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (/token|secret|password|authorization/i.test(key)) return [key, "[redacted]"];
      if (/email|phone|mobile|pin|code|first_name|last_name|inviter_name|visitor_company|remarks|name/i.test(key)) return [key, "[redacted]"];
      return [key, redact(item)];
    }));
  }
  return value;
}

async function probe(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await unifiFetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
    }, insecure);
    const contentType = response.headers.get("content-type") || "";
    let body;
    if (contentType.includes("json")) {
      try { body = redact(await response.json()); } catch { body = { parseError: true }; }
    }
    return { path, status: response.status, contentType, body };
  } catch (error) {
    return { path, error: error instanceof Error ? error.message : "Unknown request error" };
  } finally {
    clearTimeout(timeout);
  }
}

async function unifiFetch(url, options, allowInsecureTls) {
  if (!allowInsecureTls) return fetch(url, options);

  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, {
      method: options.method,
      headers: options.headers,
      agent: insecureUnifiAgent,
      signal: options.signal,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve(new Response(Buffer.concat(chunks), {
          status: response.statusCode || 500,
          headers: response.headers,
        }));
      });
    });
    request.on("error", reject);
    request.end(options.body);
  });
}

const results = await Promise.all(endpoints.map(probe));
for (const result of results) {
  const outcome = "status" in result ? `HTTP ${result.status}` : result.error;
  console.log(`${result.path}: ${outcome}`);
}

if (writeFixture) {
  const fixturePath = resolve("spikes/unifi-access/fixtures/read-probe.json");
  await mkdir(resolve("spikes/unifi-access/fixtures"), { recursive: true });
  await writeFile(fixturePath, `${JSON.stringify({ baseUrl: "[redacted]", results }, null, 2)}\n`);
  console.log(`Sanitized fixture written to ${fixturePath}`);
}
