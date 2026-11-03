/** How many of the newest messages the very first sync reads. */
export const GMAIL_FIRST_SYNC_LIMIT = 50;
/** The most messages one sync run reads, so a run stays short; the next run continues. */
export const GMAIL_MAX_PER_RUN = 100;
/** The most message ids collected to find the oldest unread ones; beyond this the next run continues. */
export const GMAIL_MAX_LISTED = 500;

export type GmailCursor = { lastInternalDateMs: number };

export type GmailListPlan = {
  /** Gmail search query (`after:<seconds>`), or null to take the newest messages. */
  query: string | null;
  /** True on the first sync: keep only the newest few instead of everything after the cursor. */
  newestOnly: boolean;
};

/** A cursor saved by this connector, or null for anything else (IMAP rows, a broken value). */
export function readGmailCursor(value: unknown): GmailCursor | null {
  const ms = (value as { lastInternalDateMs?: unknown } | null)?.lastInternalDateMs;
  return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? { lastInternalDateMs: ms } : null;
}

/**
 * No cursor: the newest few messages. With a cursor: everything received since then. Gmail's
 * `after:` has one-second resolution, so a message at the boundary can be listed again; it is
 * skipped later because messages are deduplicated by their Message-ID.
 */
export function planGmailList(cursor: GmailCursor | null): GmailListPlan {
  if (!cursor) return { query: null, newestOnly: true };
  return { query: `after:${Math.floor(cursor.lastInternalDateMs / 1000)}`, newestOnly: false };
}

/**
 * Picks which listed ids to read this run. Gmail lists newest first. After the first sync the
 * oldest ones are read first so the cursor never skips a message; the rest wait for the next run.
 */
export function pickIdsToRead<T>(listedNewestFirst: T[], newestOnly: boolean): T[] {
  if (newestOnly) return listedNewestFirst.slice(0, GMAIL_FIRST_SYNC_LIMIT);
  return [...listedNewestFirst].reverse().slice(0, GMAIL_MAX_PER_RUN);
}

/** The new cursor: the newest received time among the messages read, never moving backwards. */
export function nextGmailCursor(previous: GmailCursor | null, receivedMs: number[]): GmailCursor {
  const newest = Math.max(previous?.lastInternalDateMs ?? 0, ...receivedMs);
  return { lastInternalDateMs: newest };
}
