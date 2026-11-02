import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";

loadEnvConfig(process.cwd());

async function main() {
  const { getDb } = await import("../src/core/db");
  const rows = await getDb().execute(sql`select 1 as ok, current_database() as db`);
  console.log("db-check:", JSON.stringify(rows.rows[0]));
}

main().catch((error: unknown) => {
  console.error("db-check failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
