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

  // The offset can differ between the guess and the real midnight when a clock change falls in
  // between, so settle it in two passes.
  let instant = localMidnightAsUtc - offsetMs(new Date(localMidnightAsUtc), zone);
  instant = localMidnightAsUtc - offsetMs(new Date(instant), zone);
  return new Date(instant);
}
