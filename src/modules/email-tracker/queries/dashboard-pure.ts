import { startOfTodayIn } from "@/core/lib/time";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Escapes % _ and \ so user text is matched literally by ILIKE. Empty input gives null (no filter). */
export function likePattern(input: string): string | null {
  const text = input.trim().slice(0, 100);
  if (!text) return null;
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/** The start of the next local day: today's start plus a day and a half, then back to that day's start. */
export function startOfTomorrowIn(timeZone: string, now: Date): Date {
  return startOfTodayIn(timeZone, new Date(startOfTodayIn(timeZone, now).getTime() + DAY_MS * 1.5));
}

export type ReminderPreset = "tomorrow" | "three_days" | "one_week";

export const REMINDER_PRESETS: Array<{ key: ReminderPreset; label: string; days: number }> = [
  { key: "tomorrow", label: "Tomorrow", days: 1 },
  { key: "three_days", label: "In 3 days", days: 3 },
  { key: "one_week", label: "In 1 week", days: 7 },
];

/** When a reminder preset is due: the start of that local day, so it shows as "due today" that morning. */
export function reminderDueDate(preset: ReminderPreset, timeZone: string, now: Date): Date {
  const days = REMINDER_PRESETS.find((entry) => entry.key === preset)?.days ?? 1;
  return startOfTodayIn(timeZone, new Date(startOfTodayIn(timeZone, now).getTime() + DAY_MS * (days + 0.5)));
}

export type FollowUpGroups<T> = { overdue: T[]; today: T[]; upcoming: T[] };

/** Splits open follow-ups into overdue (before today), due today, and upcoming, oldest first within each. */
export function groupFollowUps<T extends { dueAt: Date }>(items: T[], timeZone: string, now: Date): FollowUpGroups<T> {
  const todayStart = startOfTodayIn(timeZone, now).getTime();
  const tomorrowStart = startOfTomorrowIn(timeZone, now).getTime();
  const sorted = [...items].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  return {
    overdue: sorted.filter((item) => item.dueAt.getTime() < todayStart),
    today: sorted.filter((item) => item.dueAt.getTime() >= todayStart && item.dueAt.getTime() < tomorrowStart),
    upcoming: sorted.filter((item) => item.dueAt.getTime() >= tomorrowStart),
  };
}

export type PriorityGroups<T> = { p1: T[]; p2: T[]; p3: T[]; unscanned: T[] };

/** Today's mail by AI priority; mail the AI has not looked at yet goes to `unscanned`. */
export function groupByPriority<T extends { analysis: { priority: number } | null }>(rows: T[]): PriorityGroups<T> {
  const groups: PriorityGroups<T> = { p1: [], p2: [], p3: [], unscanned: [] };
  for (const row of rows) {
    if (!row.analysis) groups.unscanned.push(row);
    else if (row.analysis.priority <= 1) groups.p1.push(row);
    else if (row.analysis.priority === 2) groups.p2.push(row);
    else groups.p3.push(row);
  }
  return groups;
}

export type MailCursor = { receivedAtMs: number; id: string };

/** A page position as one URL-safe string: the received time and id of the last row shown. */
export function encodeCursor(cursor: MailCursor): string {
  return `${cursor.receivedAtMs}_${cursor.id}`;
}

/** Reads a position back; anything malformed means "start from the top". */
export function decodeCursor(value: string | null | undefined): MailCursor | null {
  const match = value?.match(/^(\d{1,15})_([0-9a-f-]{36})$/i);
  return match ? { receivedAtMs: Number(match[1]), id: match[2] } : null;
}
