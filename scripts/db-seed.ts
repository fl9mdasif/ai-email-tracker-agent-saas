import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { getDb } = await import("../src/core/db");
  const { modules } = await import("../src/core/db/schema");
  await getDb()
    .insert(modules)
    .values({ key: "email-tracker", name: "AI Email Tracker" })
    .onConflictDoNothing();
  console.log("db-seed: module catalog ready");
}

main().catch((error: unknown) => {
  console.error("db-seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
