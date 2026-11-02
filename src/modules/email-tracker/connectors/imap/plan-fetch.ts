/** How many of the newest messages the very first sync reads. */
export const FIRST_SYNC_LIMIT = 50;
/** The most messages one sync run reads, so a run stays short; the next run continues. */
export const MAX_PER_RUN = 100;

export type SyncCursor = { uidValidity: string; lastUid: number };

export type FetchPlan = {
  /** IMAP UID range such as "120:219", or null when there is nothing to read. */
  range: string | null;
  /** The highest UID this run covers; saved as the new cursor once the run succeeds. */
  upTo: number;
};

/**
 * Decides which UIDs to read. A missing cursor, or a changed UIDVALIDITY (the server
 * renumbered the mailbox), means starting over with the newest messages; anything already
 * stored is skipped later because messages are deduplicated by their Message-ID.
 */
export function planFetch(cursor: SyncCursor | null, uidValidity: string, uidNext: number): FetchPlan {
  const newest = uidNext - 1;

  if (!cursor || cursor.uidValidity !== uidValidity) {
    if (newest < 1) return { range: null, upTo: 0 };
    const from = Math.max(1, newest - FIRST_SYNC_LIMIT + 1);
    return { range: `${from}:${newest}`, upTo: newest };
  }

  if (newest <= cursor.lastUid) return { range: null, upTo: cursor.lastUid };

  const from = cursor.lastUid + 1;
  const to = Math.min(newest, cursor.lastUid + MAX_PER_RUN);
  return { range: `${from}:${to}`, upTo: to };
}
