import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./lib/schema.ts",
  out: "./drizzle",
});
