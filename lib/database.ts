import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { drizzle } from "drizzle-orm/node-sqlite";
import { relations } from "./relations.ts";

const databasePath = process.env.GATEY_DB_PATH || join(process.cwd(), "data", "gatey.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

const globalForDatabase = globalThis as unknown as { gateyDatabase?: DatabaseSync };

export const sqlite = globalForDatabase.gateyDatabase ?? new DatabaseSync(databasePath, { timeout: 5_000 });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.gateyDatabase = sqlite;
}

sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");
sqlite.exec("PRAGMA optimize");

export const database = drizzle({ client: sqlite, relations });
