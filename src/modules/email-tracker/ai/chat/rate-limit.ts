import { and, desc, eq, gte, ne } from "drizzle-orm";
import type { Database } from "@/core/db";
import { etChatMessages } from "../../db/schema";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** How much a workspace may ask. These move into the platform settings later; until then they are constants. */
export const CHAT_LIMITS = { perHour: 20, perDay: 100, maxQuestionChars: 500 } as const;

export type ChatQuota = {
  usedLastHour: number;
  usedLastDay: number;
  leftThisHour: number;
  leftToday: number;
  /** False when either limit is reached. */
  allowed: boolean;
  /** Which limit stopped the question, if any. */
  blockedBy: "hour" | "day" | null;
  /** Minutes until a question can be asked again, rounded up; null when allowed. */
  retryAfterMinutes: number | null;
};

/**
 * Works out what is left from the times of the questions already counted. Both windows are rolling
 * (the last 60 minutes and the last 24 hours), so there is no midnight reset to game.
 */
export function computeQuota(askedAt: Date[], now: Date, limits: { perHour: number; perDay: number } = CHAT_LIMITS): ChatQuota {
  const nowMs = now.getTime();
  const lastHour = askedAt.map((date) => date.getTime()).filter((time) => time > nowMs - HOUR_MS && time <= nowMs);
  const lastDay = askedAt.map((date) => date.getTime()).filter((time) => time > nowMs - DAY_MS && time <= nowMs);

  const leftThisHour = Math.max(0, limits.perHour - lastHour.length);
  const leftToday = Math.max(0, limits.perDay - lastDay.length);
  const blockedBy: ChatQuota["blockedBy"] = leftThisHour === 0 ? "hour" : leftToday === 0 ? "day" : null;

  let retryAfterMinutes: number | null = null;
  if (blockedBy) {
    // The window frees up when the oldest question still counted falls out of it.
    const windowMs = blockedBy === "hour" ? HOUR_MS : DAY_MS;
    const counted = blockedBy === "hour" ? lastHour : lastDay;
    const oldest = Math.min(...counted);
    retryAfterMinutes = Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 60_000));
  }

  return { usedLastHour: lastHour.length, usedLastDay: lastDay.length, leftThisHour, leftToday, allowed: blockedBy === null, blockedBy, retryAfterMinutes };
}

/** A readable reason for a refused question. */
export function describeBlock(quota: ChatQuota): string {
  if (quota.blockedBy === "hour") return `You have used all ${CHAT_LIMITS.perHour} questions for this hour. You can ask again in about ${quota.retryAfterMinutes} minutes.`;
  if (quota.blockedBy === "day") return `You have used all ${CHAT_LIMITS.perDay} questions for the last 24 hours. You can ask again in about ${quota.retryAfterMinutes} minutes.`;
  return "";
}

/**
 * The workspace's quota right now, from the questions asked in the last 24 hours. Every user of the
 * workspace shares it. Attempts that failed only because the AI service was paused are not counted.
 */
export async function getChatQuota(db: Database, tenantId: string, now: Date = new Date()): Promise<ChatQuota> {
  const rows = await db
    .select({ createdAt: etChatMessages.createdAt })
    .from(etChatMessages)
    .where(
      and(
        eq(etChatMessages.tenantId, tenantId),
        eq(etChatMessages.role, "user"),
        ne(etChatMessages.status, "paused"),
        gte(etChatMessages.createdAt, new Date(now.getTime() - DAY_MS)),
      ),
    )
    .orderBy(desc(etChatMessages.createdAt))
    .limit(CHAT_LIMITS.perDay + 50);
  return computeQuota(
    rows.map((row) => row.createdAt),
    now,
  );
}
