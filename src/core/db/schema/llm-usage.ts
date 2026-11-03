import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenancy";

/**
 * One row per model call, per tenant. Stores only metadata (tag, model, token counts, outcome,
 * time taken): never the prompt or the reply, which can contain private email text. Cost is
 * worked out from the token counts at report time, because prices change.
 */
export const llmUsage = pgTable(
  "llm_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    usageTag: text("usage_tag").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    status: text("status", {
      enum: ["ok", "invalid_output", "error", "quota_exhausted", "auth_failed"],
    }).notNull(),
    latencyMs: integer("latency_ms").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("llm_usage_tenant_created_idx").on(table.tenantId, table.createdAt)],
);
