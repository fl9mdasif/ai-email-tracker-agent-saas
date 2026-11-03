"use client";

import { BellPlus, Check, Loader2, Sparkles, Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { REMINDER_PRESETS } from "@/modules/email-tracker/queries/dashboard-pure";
import { type ActionResult, analyzeEmailNowAction, followUpStatusAction, remindAction, setHandledAction } from "./mail-actions";

/** Runs an action, shows its message under the buttons, and re-reads the page. */
function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, result, run };
}

function Note({ result }: { result: ActionResult | null }) {
  if (!result || result.ok) return null;
  return (
    <p role="status" aria-live="polite" className="w-full text-xs text-destructive">
      {result.message}
    </p>
  );
}

/** "Mark handled", or "Undo" when it already is. */
export function HandledButton({ emailId, handled }: { emailId: string; handled: boolean }) {
  const { pending, result, run } = useAction();
  return (
    <>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setHandledAction(emailId, !handled))}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : handled ? <Undo2 className="size-3.5" /> : <Check className="size-3.5" />}
        {handled ? "Undo" : "Mark handled"}
      </Button>
      <Note result={result} />
    </>
  );
}

/** A small menu: a few quick choices and a date picker. Uses a plain <details>, so it needs no extra library. */
export function RemindMenu({ emailId }: { emailId: string }) {
  const { pending, result, run } = useAction();
  const menu = useRef<HTMLDetailsElement>(null);
  const [date, setDate] = useState("");
  const close = () => menu.current?.removeAttribute("open");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <details ref={menu} className="relative">
        <summary className="inline-flex h-7 cursor-pointer list-none items-center gap-1.5 rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted [&::-webkit-details-marker]:hidden">
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <BellPlus className="size-3.5" />}
          Remind me
        </summary>
        <div className="absolute right-0 z-20 mt-1 grid w-56 gap-1 rounded-xl border bg-popover p-2 shadow-lg">
          {REMINDER_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              disabled={pending}
              onClick={() => run(() => remindAction(emailId, preset.key), close)}
              className="rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              {preset.label}
            </button>
          ))}
          <div className="mt-1 flex items-center gap-1 border-t pt-2">
            <input
              type="date"
              aria-label="Pick a date"
              min={today}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm"
            />
            <Button size="sm" disabled={pending || !date} onClick={() => run(() => remindAction(emailId, { date }), () => { setDate(""); close(); })}>
              Set
            </Button>
          </div>
        </div>
      </details>
      <Note result={result} />
    </>
  );
}

/** Done / Dismiss for one follow-up. */
export function FollowUpButtons({ followUpId }: { followUpId: string }) {
  const { pending, result, run } = useAction();
  return (
    <>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => followUpStatusAction(followUpId, "done"))}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        Done
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => followUpStatusAction(followUpId, "dismissed"))}>
        <X className="size-3.5" />
        Dismiss
      </Button>
      <Note result={result} />
    </>
  );
}

/** Runs the AI on this one email (for mail older than today, which the automatic scan skips). */
export function AnalyzeButton({ emailId }: { emailId: string }) {
  const { pending, result, run } = useAction();
  return (
    <>
      <Button size="sm" disabled={pending} onClick={() => run(() => analyzeEmailNowAction(emailId))}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        Analyze this email
      </Button>
      <Note result={result} />
    </>
  );
}
