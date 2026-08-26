#!/usr/bin/env node

const host = process.env.UNIFI_HOST;
const token = process.env.UNIFI_ACCESS_API_TOKEN;
const port = process.env.UNIFI_ACCESS_PORT || "12445";
const doorName = (process.env.UNIFI_DOOR_NAME || "Gate").trim();
const insecure = ["1", "true", "yes"].includes((process.env.UNIFI_INSECURE_TLS || "").toLowerCase());
const create = process.argv.includes("--create");
const revokeIndex = process.argv.indexOf("--revoke");
const revokeId = revokeIndex >= 0 ? process.argv[revokeIndex + 1] : undefined;
const minutesIndex = process.argv.indexOf("--minutes");
const minutes = minutesIndex >= 0 ? Number(process.argv[minutesIndex + 1]) : 10;

if (!host || !token) throw new Error("UNIFI_HOST and UNIFI_ACCESS_API_TOKEN are required.");
if (insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
if (!create && !revokeId) throw new Error("Use --create or --revoke <visitor-id>.");
if (create && revokeId) throw new Error("Use only one action at a time.");
if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) throw new Error("--minutes must be an integer from 1 to 60.");

const apiRoot = `https://${host}:${port}/api/v1/developer`;

async function api(path, options = {}) {
  const response = await fetch(`${apiRoot}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !["SUCCESS", "OK"].includes(String(body.code || "").toUpperCase())) {
    throw new Error(`UniFi request failed (${response.status}): ${body.msg || body.message || body.code || "unknown error"}`);
  }
  return body;
}

if (revokeId) {
  await api(`/visitors/${encodeURIComponent(revokeId)}`, { method: "DELETE" });
  console.log(`Visitor ${revokeId} revoked.`);
  process.exit(0);
}

const topology = await api("/door_groups/topology");
const doors = (topology.data || []).flatMap((group) =>
  (group.resource_topologies || []).flatMap((floor) => floor.resources || []),
);
const door = doors.find((resource) => String(resource.name || "").trim().toLowerCase() === doorName.toLowerCase());
if (!door?.id) throw new Error(`No door named '${doorName}' was found in the UniFi door-group topology.`);

const start = Math.floor(Date.now() / 1_000) - 60;
const end = start + (minutes + 1) * 60;
const weekSchedule = Object.fromEntries(
  ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map((day) => [
    day,
    [{ start_time: "00:00:00", end_time: "23:59:59" }],
  ]),
);
const payload = {
  first_name: "Gatey",
  last_name: "API Probe",
  // The documented source of visitor locations is door_groups/topology.
  resources: [{ id: door.id, type: "door" }],
  start_time: start,
  end_time: end,
  // UniFi calls a visitor "one time" when this is omitted. This makes a
  // temporary code usable repeatedly throughout its start/end window.
  week_schedule: weekSchedule,
  visit_reason: "Others",
  remarks: "Delete after reader test",
};

const created = await api("/visitors", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
const visitor = created.data;
const id = typeof visitor === "object" && visitor ? visitor.id : undefined;
if (!id) throw new Error("UniFi accepted the request but did not return a visitor id.");

await new Promise((resolve) => setTimeout(resolve, 1_500));
const reconciliation = await api("/visitors");
const reconciled = reconciliation.data?.find((item) => item.id === id);
if (!reconciled || !Array.isArray(reconciled.resources) || reconciled.resources.length === 0) {
  try { await api(`/visitors/${encodeURIComponent(id)}`, { method: "DELETE" }); } catch { /* Report the original failure. */ }
  throw new Error("UniFi created a visitor without a gate resource; it was revoked automatically.");
}

const generatedPin = await api("/credentials/pin_codes", { method: "POST" });
const pin = typeof generatedPin.data === "string" ? generatedPin.data : undefined;
if (!pin) {
  try { await api(`/visitors/${encodeURIComponent(id)}`, { method: "DELETE" }); } catch { /* Report the original failure. */ }
  throw new Error("UniFi did not return a generated PIN; the probe visitor was revoked.");
}
await api(`/visitors/${encodeURIComponent(id)}/pin_codes`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ pin_code: pin }),
});

console.log(`Created Gatey probe visitor ${id}.`);
console.log(`PIN: ${pin}`);
console.log(`Assigned resources: ${reconciled.resources.length}. Valid for ${minutes} minutes. Test it at the reader, then run:`);
console.log(`npm run spike:unifi:visitor -- --revoke ${id}`);
