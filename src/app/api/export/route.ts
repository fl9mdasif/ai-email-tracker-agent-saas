import { getDb } from "@/core/db";
import { requireModule } from "@/core/modules/guard";
import { exportTenantData } from "@/modules/email-tracker/queries/export";

/**
 * Downloads everything Loopify holds for the signed-in workspace as one JSON file. The tenant
 * comes from the session; passwords and tokens are never part of it.
 */
export async function GET() {
  const session = await requireModule("email-tracker");
  const data = await exportTenantData(getDb(), session.tenantId);
  if (!data) return new Response("Not found", { status: 404 });

  const day = data.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="loopify-export-${day}.json"`,
      // This is private mail: nothing may cache it.
      "cache-control": "no-store",
    },
  });
}
