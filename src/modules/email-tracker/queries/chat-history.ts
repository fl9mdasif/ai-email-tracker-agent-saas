import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/core/db";
import { etChatMessages } from "../db/schema";

/** The longest message stored. Answers are far shorter; this only stops a runaway reply from filling the table. */
export const MAX_STORED_CHARS = 4000;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citedEmailIds: string[];
  status: "ok" | "error" | "paused";
  createdAt: Date;
};

export type NewChatMessage = {
  tenantId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  citedEmailIds?: string[];
  status?: "ok" | "error" | "paused";
};

/** Saves one message of the conversation. Returns its id. */
export async function addChatMessage(db: Database, message: NewChatMessage): Promise<string> {
  const [row] = await db
    .insert(etChatMessages)
    .values({
      tenantId: message.tenantId,
      userId: message.userId,
      role: message.role,
      content: message.content.slice(0, MAX_STORED_CHARS),
      citedEmailIds: (message.citedEmailIds ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 50),
      status: message.status ?? "ok",
    })
    .returning({ id: etChatMessages.id });
  return row.id;
}

/** The last messages of this user's conversation, oldest first. Scoped to the workspace and the person. */
export async function listChatMessages(db: Database, tenantId: string, userId: string, limit = 30): Promise<ChatMessage[]> {
  const rows = await db
    .select({
      id: etChatMessages.id,
      role: etChatMessages.role,
      content: etChatMessages.content,
      citedEmailIds: etChatMessages.citedEmailIds,
      status: etChatMessages.status,
      createdAt: etChatMessages.createdAt,
    })
    .from(etChatMessages)
    .where(and(eq(etChatMessages.tenantId, tenantId), eq(etChatMessages.userId, userId)))
    .orderBy(desc(etChatMessages.createdAt), desc(etChatMessages.id))
    .limit(Math.min(limit, 100));
  return rows.reverse();
}

/** The last few answered turns, as context for a follow-up question. Failed and paused attempts are left out. */
export async function recentTurns(db: Database, tenantId: string, userId: string, count = 4): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const rows = await db
    .select({ role: etChatMessages.role, content: etChatMessages.content })
    .from(etChatMessages)
    .where(and(eq(etChatMessages.tenantId, tenantId), eq(etChatMessages.userId, userId), eq(etChatMessages.status, "ok")))
    .orderBy(desc(etChatMessages.createdAt), desc(etChatMessages.id))
    .limit(count);
  return rows.reverse();
}

/** Deletes this person's whole conversation (their own only). Returns how many messages went. */
export async function clearChat(db: Database, tenantId: string, userId: string): Promise<number> {
  const deleted = await db
    .delete(etChatMessages)
    .where(and(eq(etChatMessages.tenantId, tenantId), eq(etChatMessages.userId, userId)))
    .returning({ id: etChatMessages.id });
  return deleted.length;
}
