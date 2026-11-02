// Gives accounts saved before the `brand` column existed their display brand.
// Reads each account's preset from the vault in memory; prints only counts, never secrets.
// Safe to run again: it only touches accounts that have no brand yet.
import { loadEnvConfig } from "@next/env";
import { isNull } from "drizzle-orm";

loadEnvConfig(process.cwd());

async function main() {
  const { getDb } = await import("../src/core/db");
  const { connectedAccounts } = await import("../src/core/db/schema");
  const { getCredentials, setAccountBrand } = await import("../src/core/vault");
  const { brandForPreset } = await import("../src/modules/email-tracker/providers/brands");
  const db = getDb();

  const missing = await db
    .select({ id: connectedAccounts.id, tenantId: connectedAccounts.tenantId, provider: connectedAccounts.provider })
    .from(connectedAccounts)
    .where(isNull(connectedAccounts.brand));

  let updated = 0;
  let skipped = 0;
  for (const account of missing) {
    const credentials = account.provider === "imap" ? await getCredentials(db, account.tenantId, account.id) : null;
    const brand = typeof credentials?.preset === "string" ? brandForPreset(credentials.preset) : null;
    if (!brand) {
      skipped += 1;
      continue;
    }
    await setAccountBrand(db, account.tenantId, account.id, brand);
    updated += 1;
  }
  console.log(`backfill-brand: ${missing.length} without a brand, ${updated} updated, ${skipped} skipped`);
}

main().catch((error: unknown) => {
  console.error("backfill-brand failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
