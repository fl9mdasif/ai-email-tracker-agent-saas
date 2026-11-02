import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";

loadEnvConfig(process.cwd());

async function main() {
  const { getDb } = await import("../src/core/db");
  const db = getDb();
  const ping = await db.execute(sql`select 1 as ok, current_database() as db`);
  console.log("db-check:", JSON.stringify(ping.rows[0]));
  const tables = await db.execute(
    sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`,
  );
  console.log("tables:", tables.rows.map((row) => row.table_name).join(", "));
}

main().catch((error: unknown) => {
  console.error("db-check failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
