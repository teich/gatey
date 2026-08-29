import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { database } from "../lib/database.ts";
import { user, userPhoneNumbers } from "../lib/schema.ts";

function usage() {
  console.log("Usage: npm run phones:import -- --callers <allowed-callers.toml> [--map <phone-map.json>] [--apply]");
  console.log('Mapping JSON format: { "+17075551111": "resident@example.com" }');
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalizePhone(value) {
  const compact = String(value).trim().replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{1,14}$/.test(compact)) throw new Error(`Invalid E.164 phone number: ${value}`);
  return compact;
}

function parseValue(value) {
  const cleaned = value.trim();
  if (cleaned === "true" || cleaned === "false") return cleaned === "true";
  if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
    return [...cleaned.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
  }
  const quoted = cleaned.match(/^"(.*)"$/);
  return quoted ? quoted[1] : cleaned;
}

function parseCallers(text) {
  const callers = [];
  let current;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line === "[[callers]]") {
      current = {};
      callers.push(current);
      continue;
    }
    if (!current || !line.includes("=")) continue;
    const split = line.indexOf("=");
    current[line.slice(0, split).trim()] = parseValue(line.slice(split + 1));
  }
  return callers;
}

const callersFile = option("--callers");
if (!callersFile || process.argv.includes("--help")) {
  usage();
  process.exitCode = callersFile ? 0 : 1;
} else {
  const mappingFile = option("--map");
  const mappings = mappingFile ? JSON.parse(readFileSync(resolve(mappingFile), "utf8")) : {};
  const callers = parseCallers(readFileSync(resolve(callersFile), "utf8"));
  const rows = [];
  let hasErrors = false;

  for (const caller of callers) {
    try {
      const phone = normalizePhone(caller.number || "");
      const mappedEmail = mappings[phone];
      let users;
      if (mappedEmail) {
        users = database.select({ id: user.id, name: user.name, email: user.email }).from(user)
          .where(sql`lower(${user.email}) = lower(${mappedEmail})`).all();
      } else {
        users = database.select({ id: user.id, name: user.name, email: user.email }).from(user)
          .where(sql`lower(${user.name}) = lower(${String(caller.name || "")})`).all();
      }
      if (users.length !== 1) {
        hasErrors = true;
        rows.push({ phone, caller: caller.name || "", result: mappedEmail ? `No unique user for ${mappedEmail}` : "Needs explicit email mapping" });
        continue;
      }
      const actions = Array.isArray(caller.actions) ? caller.actions : ["open"];
      rows.push({ phone, caller: caller.name || "", user: `${users[0].name} <${users[0].email}>`, userId: users[0].id, enabled: caller.enabled !== false, canOpen: actions.includes("open"), canHoldOpen: actions.includes("hold_open"), notes: String(caller.notes || ""), result: "Ready" });
    } catch (error) {
      hasErrors = true;
      rows.push({ phone: caller.number || "", caller: caller.name || "", result: error instanceof Error ? error.message : "Invalid caller" });
    }
  }

  console.table(rows.map((row) => ({ phone: row.phone, caller: row.caller, user: row.user || "", enabled: row.enabled ?? "", canOpen: row.canOpen ?? "", canHoldOpen: row.canHoldOpen ?? "", result: row.result })));
  if (hasErrors) {
    console.error("Resolve every caller mapping before importing. No changes were made.");
    process.exitCode = 1;
  } else if (!process.argv.includes("--apply")) {
    console.log("Dry run only. Add --apply to import these callers.");
  } else {
    const now = new Date().toISOString();
    try {
      database.transaction((tx) => {
        for (const row of rows) {
          tx.insert(userPhoneNumbers).values({ id: randomUUID(), userId: row.userId, phoneE164: row.phone, label: "Mobile", notes: row.notes, enabled: row.enabled, canOpen: row.canOpen, canHoldOpen: row.canHoldOpen, createdAt: now, updatedAt: now })
            .onConflictDoUpdate({ target: userPhoneNumbers.phoneE164, set: { userId: row.userId, notes: row.notes, enabled: row.enabled, canOpen: row.canOpen, canHoldOpen: row.canHoldOpen, updatedAt: now } }).run();
        }
      }, { behavior: "immediate" });
      console.log(`Imported ${rows.length} phone ${rows.length === 1 ? "number" : "numbers"}.`);
    } catch (error) {
      throw error;
    }
  }
}
