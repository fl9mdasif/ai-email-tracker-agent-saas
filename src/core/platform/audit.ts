import { desc, eq } from "drizzle-orm";
import type { Database } from "@/core/db";
import { platformAuditLog } from "@/core/db/schema";

export type AuditDetails = Record<string, string | number | boolean | null>;

const MAX_TEXT = 200;
const MAX_KEYS = 20;
/** Details are for "what changed", never for secrets or mail: keys that sound like either are dropped. */
const FORBIDDEN_KEY = /pass|token|secret|credential|body|subject|snippet|content/i;

/** Keeps details small and safe: plain values only, short text, no secret-looking keys. */
export function sanitizeDetails(details: Record<string, unknown> | undefined): AuditDetails {
  const clean: AuditDetails = {};
  for (const [key, value] of Object.entries(details ?? {}).slice(0, MAX_KEYS)) {
    if (FORBIDDEN_KEY.test(key)) continue;
    if (typeof value === "string") clean[key] = value.slice(0, MAX_TEXT);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) clean[key] = value;
  }
  return clean;
}

export type AuditEntry = {
  actorEmail: string;
  actorRole: string;
  /** What was done, e.g. "tenant.suspend". */
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
};

/** Records one staff action. It never throws: a logging problem must not undo or block the action itself. */
export async function writeAudit(db: Database, entry: AuditEntry): Promise<void> {
  try {
    await db.insert(platformAuditLog).values({
      actorEmail: entry.actorEmail.toLowerCase().slice(0, 254),
      actorRole: entry.actorRole.slice(0, 40),
      action: entry.action.slice(0, 80),
      targetType: (entry.targetType ?? "").slice(0, 40),
      targetId: (entry.targetId ?? "").slice(0, 80),
      details: sanitizeDetails(entry.details),
    });
  } catch {
    // Deliberately silent.
  }
}

export type AuditRow = {
  id: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  details: AuditDetails;
  createdAt: Date;
};

/** The newest audit rows, optionally for one person. */
export async function listAudit(db: Database, options: { actorEmail?: string; limit?: number } = {}): Promise<AuditRow[]> {
  const query = db.select().from(platformAuditLog);
  const filtered = options.actorEmail ? query.where(eq(platformAuditLog.actorEmail, options.actorEmail.toLowerCase())) : query;
  return filtered.orderBy(desc(platformAuditLog.createdAt)).limit(Math.min(options.limit ?? 100, 500));
}
