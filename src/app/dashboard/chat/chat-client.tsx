"use client";

import { AlertTriangle, ArrowUp, Loader2, Mail, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CHAT_PRESETS } from "@/modules/email-tracker/ai/chat/presets";
import { askChatAction, clearChatAction } from "./actions";

const MAX_CHARS = 500;
/** Below this many questions left in the hour, the counter warns. */
const LOW_QUOTA = 5;

/** One focus ring for every control on this screen, shown at once (no transition). */
const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export type ChatBubble = {
  key: string;
  role: "user" | "assistant" | "notice";
  text: string;
  cited: Array<{ id: string; from: string; subject: string }>;
  notes?: string[];
  /** A notice that is an error rather than information. */
  problem?: boolean;
};

function Avatar() {
  return (
    <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Sparkles className="size-3.5" />
    </span>
  );
}

function Message({ bubble }: { bubble: ChatBubble }) {
  if (bubble.role === "notice") {
    return (
      <li role="status" className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-3.5" />
        </span>
        <p className={cn("pt-1 text-sm", bubble.problem ? "text-destructive" : "text-muted-foreground")}>{bubble.text}</p>
      </li>
    );
  }

  // Your questions: a quiet bubble on the right. The accent is kept for the Send button.
  if (bubble.role === "user") {
    return (
      <li className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-sm whitespace-pre-wrap break-words sm:max-w-[75%]">{bubble.text}</p>
      </li>
    );
  }

  // Answers: open text beside the assistant mark, the way chat tools set a reply.
  return (
    <li className="flex items-start gap-3">
      <Avatar />
      <div className="grid min-w-0 flex-1 gap-3 pt-1">
        {/* Plain text only: an answer is never rendered as HTML, so nothing inside it can run. */}
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{bubble.text}</p>
        {bubble.notes?.map((note) => (
          <p key={note} className="text-xs text-muted-foreground">
            {note}
          </p>
        ))}
        {bubble.cited.length > 0 ? (
          <div className="grid gap-1.5">
            <p className="text-xs text-muted-foreground">Emails in this answer</p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {bubble.cited.map((email) => (
                <li key={email.id} className="min-w-0">
                  <Link
                    href={`/dashboard/mail/${email.id}`}
                    className={cn("flex min-w-0 items-start gap-2.5 rounded-xl border bg-card px-3 py-2 transition-colors hover:bg-muted/60", focusRing)}
                  >
                    <Mail className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span className="grid min-w-0">
                      <span className="truncate text-xs font-medium">{email.from}</span>
                      <span className="truncate text-xs text-muted-foreground">{email.subject}</span>
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

/** Three pulsing dots while the answer is on its way (the AI does not stream). They hold still when motion is reduced. */
function Thinking() {
  return (
    <li className="flex items-start gap-3" role="status">
      <Avatar />
      <div className="flex h-8 items-center gap-1">
        <span className="sr-only">Looking through your mail…</span>
        {[0, 150, 300].map((delay) => (
          <span key={delay} className="size-1.5 rounded-full bg-muted-foreground/60 motion-safe:animate-pulse" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </div>
    </li>
  );
}

export function ChatClient({ initial, leftThisHour: initialLeft, limitPerHour }: { initial: ChatBubble[]; leftThisHour: number; limitPerHour: number }) {
  const [bubbles, setBubbles] = useState<ChatBubble[]>(initial);
  const [draft, setDraft] = useState("");
  const [left, setLeft] = useState(initialLeft);
  const [pending, startTransition] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const counter = useRef(0);
  const firstScroll = useRef(true);

  // Keep the newest message in view by scrolling the list itself, never the whole page:
  // a jump on first load, a smooth scroll after that.
  useEffect(() => {
    const list = scroller.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: firstScroll.current ? "instant" : "smooth" });
    firstScroll.current = false;
  }, [bubbles, pending]);

  const nextKey = () => `local-${(counter.current += 1)}`;

  function send(question: { question?: string; presetId?: string }, shownText: string) {
    setBubbles((current) => [...current, { key: nextKey(), role: "user", text: shownText, cited: [] }]);
    startTransition(async () => {
      const result = await askChatAction(question);
      setLeft(result.leftThisHour);
      setBubbles((current) => [
        ...current,
        result.ok
          ? { key: nextKey(), role: "assistant", text: result.answer, cited: result.cited, notes: result.notes }
          : { key: nextKey(), role: "notice", text: result.message, cited: [], problem: true },
      ]);
      input.current?.focus();
    });
  }

  function submit() {
    const question = draft.trim();
    if (!question || pending || question.length > MAX_CHARS || left <= 0) return;
    setDraft("");
    send({ question }, question);
  }

  const empty = bubbles.length === 0;
  const tooLong = draft.length > MAX_CHARS;
  const canSend = !pending && draft.trim().length > 0 && !tooLong && left > 0;
  const presetsOff = pending || left <= 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card" aria-label="Chat">
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-base leading-tight font-semibold">Ask your mailbox</h1>
          <p className="truncate text-xs text-muted-foreground">Reads your sorted mail. It never sends or changes anything.</p>
        </div>
        <ClearButton disabled={pending || empty} onCleared={() => setBubbles([])} />
      </header>

      {/* The conversation: the only part of the screen that scrolls. */}
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {empty && !pending ? (
          <div className="m-auto grid w-full max-w-xl gap-6 px-4 py-8">
            <div className="grid justify-items-center gap-2 text-center">
              <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="size-5" />
              </span>
              <p className="font-display text-lg font-semibold">What do you want to know?</p>
              <p className="text-sm text-muted-foreground">Ask in plain words, in English or Bangla, or start with one of these.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2" aria-label="Suggested questions">
              {CHAT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={presetsOff}
                  onClick={() => send({ presetId: preset.id }, preset.label)}
                  className={cn(
                    "rounded-xl border bg-background px-4 py-3 text-left text-sm transition-colors hover:bg-muted active:bg-muted/80 disabled:pointer-events-none disabled:opacity-50",
                    focusRing,
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-6 sm:px-6" aria-live="polite" aria-label="Conversation">
            {bubbles.map((bubble) => (
              <Message key={bubble.key} bubble={bubble} />
            ))}
            {pending ? <Thinking /> : null}
          </ul>
        )}
      </div>

      {/* The composer: always at the bottom of the screen, on a tinted strip so the white box reads as the input. */}
      <div className="shrink-0 border-t bg-muted/60 px-3 pt-3 pb-2 sm:px-4">
        <div className="mx-auto grid w-full max-w-3xl gap-2">
          {!empty ? (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:none]" aria-label="Suggested questions">
              {CHAT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={presetsOff}
                  onClick={() => send({ presetId: preset.id }, preset.label)}
                  className={cn(
                    "shrink-0 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
                    focusRing,
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          ) : null}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            className={cn(
              "flex items-end gap-2 rounded-2xl border border-foreground/20 bg-background py-1.5 pr-1.5 pl-4 shadow-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
              tooLong && "border-destructive",
            )}
          >
            <label htmlFor="chat-input" className="sr-only">
              Your question
            </label>
            <textarea
              ref={input}
              id="chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submit();
                }
              }}
              rows={1}
              maxLength={MAX_CHARS + 50}
              placeholder={left > 0 ? "Ask about your mail" : "No questions left this hour"}
              disabled={left <= 0}
              aria-describedby="chat-hint"
              className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm"
            />
            <Button type="submit" size="icon" className="size-9 shrink-0 rounded-xl" aria-label="Send" disabled={!canSend}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </Button>
          </form>

          <div id="chat-hint" className="flex flex-wrap items-center justify-between gap-x-4 px-1 text-[11px] text-muted-foreground">
            <span className="hidden sm:inline">Enter to send, Shift and Enter for a new line</span>
            <span className="flex gap-3 tabular-nums">
              <span className={cn(tooLong && "font-medium text-destructive")}>
                {draft.length}/{MAX_CHARS}
              </span>
              <span className={cn(left < LOW_QUOTA && "font-medium text-destructive")}>
                {left < LOW_QUOTA ? `${left} questions left this hour` : `${left} of ${limitPerHour} left this hour`}
              </span>
            </span>
          </div>
        </div>
      </div>
    </section>
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
      aria-label="Clear chat"
      onClick={() =>
        startTransition(async () => {
          await clearChatAction();
          onCleared();
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      <span className="hidden sm:inline">Clear chat</span>
    </Button>
  );
}
