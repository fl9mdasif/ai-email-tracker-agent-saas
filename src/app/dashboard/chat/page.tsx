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
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <header className="grid gap-1">
        <h1 className="font-display text-2xl font-semibold">Chat</h1>
        <p className="text-sm text-muted-foreground">
          Ask what needs your attention. Answers come from your sorted mail (never the whole mailbox) and are saved here until you clear them.
        </p>
      </header>
      <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
        <ChatView />
      </Suspense>
    </div>
  );
}
