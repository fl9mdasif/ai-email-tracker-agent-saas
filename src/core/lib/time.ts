/** The time zone a new tenant starts with. Each tenant can change it in Settings. */
export const DEFAULT_TIME_ZONE = "Asia/Dhaka";

/** True when the runtime knows this IANA time zone name (e.g. "Asia/Dhaka"). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** How far the wall clock in `timeZone` is ahead of UTC at this instant, in milliseconds. */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  const wallClockAsUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant today began in `timeZone` (local midnight). Falls back to UTC for an unknown zone,
 * so a bad setting can never stop the scan from running.
 */
export function startOfTodayIn(timeZone: string, now: Date = new Date()): Date {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  const localMidnightAsUtc = Date.UTC(part("year"), part("month") - 1, part("day"));

  return localMidnightToInstant(localMidnightAsUtc, zone);
}

/** Turns "this calendar day at 00:00 read as UTC" into the real instant that day began in the zone. */
function localMidnightToInstant(localMidnightAsUtc: number, zone: string): Date {
  // The offset can differ between the guess and the real midnight when a clock change falls in
  // between, so settle it in two passes.
  let instant = localMidnightAsUtc - offsetMs(new Date(localMidnightAsUtc), zone);
  instant = localMidnightAsUtc - offsetMs(new Date(instant), zone);
  return new Date(instant);
}

/** The instant a calendar date ("2026-11-05") began in the zone, or null when it is not a real date. */
export function startOfLocalDate(isoDate: string, timeZone: string): Date | null {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utcMidnight = Date.UTC(year, month - 1, day);
  const check = new Date(utcMidnight);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return localMidnightToInstant(utcMidnight, isValidTimeZone(timeZone) ? timeZone : "UTC");
}

/**
 * How a mail time reads in a list, in the tenant's time zone: "Today, 14:05", "Yesterday, 09:10",
 * "12 Oct, 08:00" for this year, "12 Oct 2025" before that.
 */
export function formatMailTime(date: Date, timeZone: string, now: Date = new Date()): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone }).format(date);
  const todayStart = startOfTodayIn(zone, now);
  if (date.getTime() >= todayStart.getTime()) return `Today, ${clock}`;
  const yesterdayStart = startOfTodayIn(zone, new Date(todayStart.getTime() - 12 * 60 * 60 * 1000));
  if (date.getTime() >= yesterdayStart.getTime()) return `Yesterday, ${clock}`;
  const year = (value: Date) => new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: zone }).format(value);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: zone }).format(date);
  return year(date) === year(now) ? `${day}, ${clock}` : `${day} ${year(date)}`;
}
