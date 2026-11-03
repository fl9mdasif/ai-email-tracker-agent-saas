const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A row for each of the last `days` UTC days, oldest first, with 0 for days that had nothing, so a chart
 * has a bar slot for every day and quiet days show up as quiet instead of missing.
 */
export function fillDays(rows: Array<{ day: string; calls: number }>, days: number, now: Date): Array<{ day: string; calls: number }> {
  const known = new Map(rows.map((row) => [row.day, Number(row.calls)]));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(today - (days - 1 - index) * DAY_MS).toISOString().slice(0, 10);
    return { day, calls: known.get(day) ?? 0 };
  });
}
