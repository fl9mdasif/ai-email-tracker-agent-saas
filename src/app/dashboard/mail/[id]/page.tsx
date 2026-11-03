import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/core/auth";
import { getDb } from "@/core/db";
import { formatMailTime } from "@/core/lib/time";
import { AccountBadge, CategoryChip, PriorityChip } from "@/components/mail/chips";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getMailDetail } from "@/modules/email-tracker/queries/dashboard";
import { getTodayWindow } from "@/modules/email-tracker/scan/scan-state";
import { AnalyzeButton, HandledButton, RemindMenu } from "../../mail-controls";

async function MailDetailView({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.tenantId) return null;
  const { id } = await params;
  const db = getDb();
  const mail = await getMailDetail(db, session.tenantId, id);
  if (!mail) notFound();
  const { timeZone } = await getTodayWindow(db, session.tenantId);
  const openFollowUps = mail.followUps.filter((followUp) => followUp.status === "open");

  return (
    <article className="grid gap-4">
      <header className="grid gap-2">
        <h1 className="font-display text-xl font-semibold break-words">{mail.subject || "(no subject)"}</h1>
        <p className="text-sm">
          <span className="font-medium">{mail.fromName ?? mail.fromAddress}</span>
          {mail.fromName ? <span className="text-muted-foreground"> &lt;{mail.fromAddress}&gt;</span> : null}
        </p>
        <p className="text-xs text-muted-foreground break-words">
          To {mail.toAddresses.join(", ") || "unknown"} · {formatMailTime(mail.receivedAt, timeZone)}
        </p>
        <AccountBadge account={mail.account} />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <HandledButton emailId={mail.id} handled={mail.handled} />
        <RemindMenu emailId={mail.id} />
        {mail.account.provider === "gmail" ? (
          // Opens the same conversation in Gmail, on the right account, in a new tab.
          <a
            href={`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(mail.account.identity)}#all/${encodeURIComponent(mail.threadId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <ExternalLink className="size-3.5" />
            Open in Gmail
          </a>
        ) : null}
      </div>

      <section aria-label="What the AI made of this email" className="grid gap-2 rounded-xl border bg-card p-4">
        {mail.analysis ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <CategoryChip category={mail.analysis.category} />
              <PriorityChip priority={mail.analysis.priority} />
              {mail.analysis.needsReply ? <span className="text-xs font-medium text-brand">Needs a reply</span> : null}
            </div>
            <p className="text-sm">{mail.analysis.summary}</p>
            <p className="text-sm">
              <span className="font-medium">Next: </span>
              {mail.analysis.suggestedAction}
            </p>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">The AI has not looked at this email. The automatic scan only covers today&apos;s mail.</p>
            <AnalyzeButton emailId={mail.id} />
          </div>
        )}
      </section>

      {openFollowUps.length > 0 ? (
        <section aria-label="Follow-ups" className="grid gap-1 rounded-xl border bg-card p-4 text-sm">
          <h2 className="font-medium">Follow-ups on this email</h2>
          <ul className="grid gap-1 text-muted-foreground">
            {openFollowUps.map((followUp) => (
              <li key={followUp.id}>
                {followUp.source === "ai" ? "AI suggestion" : "Your reminder"} · due {formatMailTime(followUp.dueAt, timeZone)}
                {followUp.reason ? ` · ${followUp.reason}` : ""}
              </li>
            ))}
          </ul>
          <Link href="/dashboard/follow-ups" className="text-sm underline underline-offset-4">
            Manage in Follow-ups
          </Link>
        </section>
      ) : null}

      <section aria-label="Message" className="rounded-xl border bg-card p-4">
        {/* Plain text only: the body is never rendered as HTML, so nothing in it can run. */}
        <pre className="font-sans text-sm leading-relaxed break-words whitespace-pre-wrap">{mail.bodyText || "(this email has no text)"}</pre>
      </section>
    </article>
  );
}

export default function MailDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <Link href="/dashboard/mail" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to Mail
      </Link>
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
        <MailDetailView params={params} />
      </Suspense>
    </div>
  );
}
