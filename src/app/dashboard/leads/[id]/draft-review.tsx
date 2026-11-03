"use client";

import { CheckCircle2, KeyRound, Loader2, RefreshCw, Save, Send, SkipForward } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type DraftView, prepareDraftAction, saveDraftAction, sendDraftAction, skipLeadAction } from "../actions";

const MAX_BODY = 4000;
const field =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 md:text-sm dark:bg-input/30";

type Stage =
  | { kind: "editing" }
  | { kind: "confirming" }
  | { kind: "sent"; at: string }
  | { kind: "skipped" }
  | { kind: "needs_permission" };

/**
 * The human in the loop: the AI's draft in an editable box, with Save, Regenerate, Skip and Send.
 * Send asks once more, naming the From and To, and then sends this one email only.
 */
export function DraftReview({ leadId, from, to, initial }: { leadId: string; from: string; to: string; initial: DraftView | null }) {
  const [draft, setDraft] = useState<DraftView | null>(initial);
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [stage, setStage] = useState<Stage>({ kind: "editing" });
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(
    initial?.status === "failed" ? { text: "The last send did not go through. You can try again.", bad: true } : null,
  );
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"write" | "save" | "send" | "skip" | null>(null);
  const asked = useRef(false);

  const dirty = draft !== null && (subject !== draft.subject || body !== draft.body);
  const tooLong = body.length > MAX_BODY;
  const ready = draft !== null && subject.trim().length > 0 && body.trim().length > 0 && !tooLong;

  function write(regenerate: boolean) {
    setAction("write");
    setMessage(null);
    startTransition(async () => {
      const result = await prepareDraftAction(leadId, regenerate);
      if (result.ok) {
        setDraft(result.draft);
        setSubject(result.draft.subject);
        setBody(result.draft.body);
      } else {
        setMessage({ text: result.message, bad: true });
      }
      setAction(null);
    });
  }

  // Opening a lead with no draft yet asks the AI for one, once.
  useEffect(() => {
    if (initial || asked.current) return;
    asked.current = true;
    write(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per opened lead
  }, []);

  function save() {
    if (!draft) return;
    setAction("save");
    startTransition(async () => {
      const result = await saveDraftAction(draft.id, subject, body);
      if (result.ok) {
        setDraft({ ...draft, subject, body });
        setMessage({ text: "Saved.", bad: false });
      } else {
        setMessage({ text: result.message ?? "Could not save.", bad: true });
      }
      setAction(null);
    });
  }

  function send() {
    if (!draft) return;
    setAction("send");
    setMessage(null);
    startTransition(async () => {
      const result = await sendDraftAction(draft.id, subject, body);
      if (result.ok) {
        setStage({ kind: "sent", at: result.sentAt });
      } else if (result.code === "needs_permission") {
        setStage({ kind: "needs_permission" });
      } else {
        setStage({ kind: "editing" });
        setMessage({ text: result.message, bad: true });
      }
      setAction(null);
    });
  }

  function skip() {
    setAction("skip");
    startTransition(async () => {
      const result = await skipLeadAction(leadId);
      if (result.ok) setStage({ kind: "skipped" });
      else setMessage({ text: "Could not skip this lead.", bad: true });
      setAction(null);
    });
  }

  if (stage.kind === "sent") {
    return (
      <section className="grid justify-items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4" aria-label="Sent">
        <p className="flex items-center gap-2 font-medium">
          <CheckCircle2 className="size-4" aria-hidden />
          Sent to {to}
        </p>
        <p className="text-sm text-muted-foreground">
          This lead rests for 3 days, and a reminder on the Follow-ups page will ask whether they answered.
        </p>
        <Link href="/dashboard/leads" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Back to leads
        </Link>
      </section>
    );
  }

  if (stage.kind === "skipped") {
    return (
      <section className="grid justify-items-start gap-3 rounded-xl border p-4" aria-label="Skipped">
        <p className="font-medium">Skipped</p>
        <p className="text-sm text-muted-foreground">Nothing was sent. This lead comes back in 7 days if they are still waiting.</p>
        <Link href="/dashboard/leads" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Back to leads
        </Link>
      </section>
    );
  }

  const writing = pending && action === "write";

  return (
    <section className="grid gap-4 rounded-xl border bg-card p-4" aria-label="Follow-up draft" aria-busy={writing}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold">Your follow-up</h2>
        <p className="text-xs text-muted-foreground">Written by the AI. Check every word; fill in anything in [brackets].</p>
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">From</dt>
        <dd className="truncate">{from || "your mailbox"}</dd>
        <dt className="text-muted-foreground">To</dt>
        <dd className="truncate">{to}</dd>
      </dl>

      {writing && !draft ? (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 motion-safe:animate-spin" />
          The AI is reading the thread and writing a draft…
        </div>
      ) : null}

      {draft ? (
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Subject</span>
            <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={250} disabled={pending || stage.kind === "confirming"} className={field} />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="flex justify-between text-muted-foreground">
              Text
              <span className={cn("tabular-nums text-xs", tooLong && "font-medium text-destructive")}>
                {body.length}/{MAX_BODY}
              </span>
            </span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={10}
              disabled={pending || stage.kind === "confirming"}
              className={cn(field, "min-h-48 resize-y leading-relaxed", tooLong && "border-destructive")}
            />
          </label>
        </div>
      ) : null}

      {message ? (
        <p role="status" className={cn("text-sm", message.bad ? "text-destructive" : "text-muted-foreground")}>
          {message.text}
        </p>
      ) : null}

      {stage.kind === "needs_permission" ? (
        <div className="grid gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <KeyRound className="size-4" aria-hidden />
            Allow Loopify to send from {from || "this Gmail account"}
          </p>
          <p className="text-muted-foreground">
            So far Loopify can only read this mailbox. To send this reply, Google needs your OK to send email on your behalf. Loopify sends only when you press
            Send, one email at a time, and it still cannot delete anything. Your draft is kept.
          </p>
          <div className="flex flex-wrap gap-2">
            {/* A plain link: the browser goes to Google and comes back to this lead. */}
            <a href={`/api/connect/google/start?send=${encodeURIComponent(leadId)}${from ? `&hint=${encodeURIComponent(from)}` : ""}`} className={buttonVariants({ size: "sm" })}>
              Allow sending
            </a>
            <Button type="button" variant="ghost" size="sm" onClick={() => setStage({ kind: "editing" })}>
              Not now
            </Button>
          </div>
        </div>
      ) : null}

      {stage.kind === "confirming" ? (
        <div className="grid gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm" role="alertdialog" aria-label="Confirm send">
          <p>
            Send this email to <span className="font-medium">{to}</span> from <span className="font-medium">{from || "your mailbox"}</span>? This sends one email and
            cannot be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={send}>
              {pending && action === "send" ? <Loader2 className="size-3.5 motion-safe:animate-spin" /> : <Send className="size-3.5" />}
              Send now
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setStage({ kind: "editing" })}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {stage.kind === "editing" ? (
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button type="button" size="sm" disabled={pending || !ready} onClick={() => setStage({ kind: "confirming" })}>
            <Send className="size-3.5" />
            Send
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pending || !dirty || !ready} onClick={save}>
            {pending && action === "save" ? <Loader2 className="size-3.5 motion-safe:animate-spin" /> : <Save className="size-3.5" />}
            Save
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => write(true)}>
            {writing ? <Loader2 className="size-3.5 motion-safe:animate-spin" /> : <RefreshCw className="size-3.5" />}
            {draft ? "Regenerate" : "Write a draft"}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={skip} className="ml-auto">
            {pending && action === "skip" ? <Loader2 className="size-3.5 motion-safe:animate-spin" /> : <SkipForward className="size-3.5" />}
            Skip
          </Button>
        </div>
      ) : null}
    </section>
  );
}
