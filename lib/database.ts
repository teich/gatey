import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const databasePath = process.env.GATEY_DB_PATH || join(process.cwd(), "data", "gatey.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

const globalForDatabase = globalThis as unknown as { gateyDatabase?: DatabaseSync };

export const database = globalForDatabase.gateyDatabase ?? new DatabaseSync(databasePath, { timeout: 5_000 });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.gateyDatabase = database;
}

database.exec("PRAGMA journal_mode = WAL");
database.exec("PRAGMA foreign_keys = ON");

const migrationsDirectory = join(process.cwd(), "db", "migrations");
for (const migration of readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql")).sort()) {
  database.exec(readFileSync(join(migrationsDirectory, migration), "utf8"));
}

database.exec("PRAGMA optimize");
