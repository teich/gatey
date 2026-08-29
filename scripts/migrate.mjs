import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = join(repoRoot, "drizzle");
const databasePath = process.env.GATEY_DB_PATH || join(process.cwd(), "data", "gatey.sqlite");

mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath, { timeout: 5_000 });

try {
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");
  migrate(drizzle({ client: database }), { migrationsFolder: migrationsDirectory });
  database.exec("PRAGMA optimize");
  console.log("Database migrations are up to date.");
} finally {
  database.close();
}
