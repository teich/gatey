import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";

const testDirectory = mkdtempSync(join(tmpdir(), "gatey-tests-"));
process.env.GATEY_DB_PATH = join(testDirectory, "gatey.sqlite");
Object.assign(process.env, { NODE_ENV: "test" });

const migrationDatabase = new DatabaseSync(process.env.GATEY_DB_PATH);
migrate(drizzle({ client: migrationDatabase }), { migrationsFolder: join(process.cwd(), "drizzle") });
migrationDatabase.close();

afterAll(async () => {
  const { sqlite } = await import("@/lib/database");
  sqlite.close();
  rmSync(testDirectory, { recursive: true, force: true });
});
