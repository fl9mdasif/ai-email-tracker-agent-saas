"use client";

import { CornerDownLeft, Loader2, Mail, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CHAT_PRESETS } from "@/modules/email-tracker/ai/chat/presets";
import { askChatAction, clearChatAction } from "./actions";

const MAX_CHARS = 500;

export type ChatBubble = {
  key: string;
  role: "user" | "assistant" | "notice";
  text: string;
  cited: Array<{ id: string; from: string; subject: string }>;
  notes?: string[];
  /** A notice that is an error rather than information. */
  problem?: boolean;
};

function Bubble({ bubble }: { bubble: ChatBubble }) {
  if (bubble.role === "notice") {
    return (
      <li role="status" className={cn("rounded-lg border px-3 py-2 text-sm", bubble.problem ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300" : "bg-muted/40 text-muted-foreground")}>
        {bubble.text}
      </li>
    );
  }
  const mine = bubble.role === "user";
  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn("grid max-w-[92%] gap-2 rounded-2xl px-4 py-2.5 text-sm sm:max-w-[80%]", mine ? "bg-primary text-primary-foreground" : "border bg-card")}>
        {/* Plain text only: an answer is never rendered as HTML, so nothing inside it can run. */}
        <p className="whitespace-pre-wrap break-words">{bubble.text}</p>
        {bubble.notes?.map((note) => (
          <p key={note} className="text-xs text-muted-foreground">
            {note}
          </p>
        ))}
        {bubble.cited.length > 0 ? (
          <div className="grid gap-1 border-t pt-2">
            <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Emails mentioned</p>
            <ul className="grid gap-1">
              {bubble.cited.map((email) => (
                <li key={email.id}>
                  <Link href={`/dashboard/mail/${email.id}`} className="flex min-w-0 items-center gap-1.5 text-xs hover:underline">
                    <Mail className="size-3 shrink-0" />
                    <span className="truncate">
                      {email.from}: {email.subject}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function ChatClient({ initial, leftThisHour: initialLeft, limitPerHour }: { initial: ChatBubble[]; leftThisHour: number; limitPerHour: number }) {
  const [bubbles, setBubbles] = useState<ChatBubble[]>(initial);
  const [draft, setDraft] = useState("");
  const [left, setLeft] = useState(initialLeft);
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const counter = useRef(0);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [bubbles, pending]);

  const nextKey = () => `local-${(counter.current += 1)}`;

  function send(input: { question?: string; presetId?: string }, shownText: string) {
    setBubbles((current) => [...current, { key: nextKey(), role: "user", text: shownText, cited: [] }]);
    startTransition(async () => {
      const result = await askChatAction(input);
      setLeft(result.leftThisHour);
      setBubbles((current) => [
        ...current,
        result.ok
          ? { key: nextKey(), role: "assistant", text: result.answer, cited: result.cited, notes: result.notes }
          : { key: nextKey(), role: "notice", text: result.message, cited: [], problem: true },
      ]);
    });
  }

  function submit() {
    const question = draft.trim();
    if (!question || pending || question.length > MAX_CHARS) return;
    setDraft("");
    send({ question }, question);
  }

  const empty = bubbles.length === 0;

  return (
    <div className="grid gap-4">
      <ul className="grid gap-3" aria-live="polite" aria-label="Conversation">
        {empty ? (
          <li className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            Ask about your mail in plain words, in English or Bangla. I read what Loopify has already sorted; I cannot send, delete or change anything.
          </li>
        ) : (
          bubbles.map((bubble) => <Bubble key={bubble.key} bubble={bubble} />)
        )}
        {pending ? (
          <li className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" />
            Looking through your mail...
          </li>
        ) : null}
        <div ref={bottom} />
      </ul>

      <div className="flex flex-wrap gap-2" aria-label="Suggested questions">
        {CHAT_PRESETS.map((preset) => (
          <Button key={preset.id} variant="outline" size="sm" disabled={pending || left <= 0} onClick={() => send({ presetId: preset.id }, preset.label)}>
            {preset.label}
          </Button>
        ))}
      </div>

      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Your question
        </label>
        <textarea
          id="chat-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          rows={2}
          maxLength={MAX_CHARS + 50}
          placeholder="For example: which invoices are still waiting?"
          className="w-full resize-none rounded-xl border border-input bg-transparent px-3 py-2 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            <span className={cn(draft.length > MAX_CHARS && "text-destructive")}>
              {draft.length}/{MAX_CHARS}
            </span>
            {" · "}
            {left} of {limitPerHour} questions left this hour
          </p>
          <div className="flex items-center gap-2">
            <ClearButton disabled={pending || empty} onCleared={() => setBubbles([])} />
            <Button type="submit" disabled={pending || !draft.trim() || draft.length > MAX_CHARS || left <= 0}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <CornerDownLeft className="size-4" />}
              Ask
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ClearButton({ disabled, onCleared }: { disabled: boolean; onCleared: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          await clearChatAction();
          onCleared();
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      Clear chat
    </Button>
  );
}
