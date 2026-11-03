import { Suspense } from "react";
import { auth } from "@/core/auth";
import { getDb } from "@/core/db";
import { Skeleton } from "@/components/ui/skeleton";
import { CHAT_LIMITS, getChatQuota } from "@/modules/email-tracker/ai/chat/rate-limit";
import { getEmailBriefs } from "@/modules/email-tracker/queries/chat";
import { listChatMessages } from "@/modules/email-tracker/queries/chat-history";
import { type ChatBubble, ChatClient } from "./chat-client";

async function ChatView() {
  const session = await auth();
  if (!session?.tenantId || !session.userId) return null;
  const db = getDb();

  const [messages, quota] = await Promise.all([listChatMessages(db, session.tenantId, session.userId, 30), getChatQuota(db, session.tenantId)]);
  const briefs = await getEmailBriefs(db, session.tenantId, messages.flatMap((message) => message.citedEmailIds));

  const initial: ChatBubble[] = messages.map((message) => ({
    key: message.id,
    role: message.role === "user" ? "user" : message.status === "ok" ? "assistant" : "notice",
    text: message.content,
    cited: message.citedEmailIds.flatMap((id) => (briefs.has(id) ? [briefs.get(id)!] : [])),
    problem: message.role === "assistant" && message.status !== "ok",
  }));

  return <ChatClient initial={initial} leftThisHour={quota.leftThisHour} limitPerHour={CHAT_LIMITS.perHour} />;
}

export default function ChatPage() {
  return (
    // Pinned to the screen: between the phone header (h-14) and bottom bar (h-16), or beside the
    // 240px sidebar on larger screens. The window never scrolls here; only the conversation does,
    // so the text box is always visible at the bottom.
    <div className="fixed inset-x-0 top-14 bottom-16 z-10 flex flex-col bg-background p-3 md:inset-y-0 md:right-0 md:left-60 md:p-6">
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
        <Suspense fallback={<Skeleton className="min-h-0 w-full flex-1 rounded-2xl" />}>
          <ChatView />
        </Suspense>
      </div>
    </div>
  );
}
