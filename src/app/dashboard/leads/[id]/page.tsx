import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/core/auth";
import { getDb } from "@/core/db";
import { formatMailTime } from "@/core/lib/time";
import { Skeleton } from "@/components/ui/skeleton";
import { getOpenDraft } from "@/modules/email-tracker/ai/draft/service";
import { getLead } from "@/modules/email-tracker/queries/leads";
import { getTodayWindow } from "@/modules/email-tracker/scan/scan-state";
import { TemperatureChip } from "../temperature";
import { DraftReview } from "./draft-review";


const GMAIL_NOTICES: Record<string, { text: string; good: boolean }> = {
  send_allowed: { text: "Sending is allowed for this Gmail account now. Check the draft and press Send.", good: true },
  send_denied: { text: "Google did not give permission to send, so nothing was sent. Press Allow sending again and tick the box that lets Loopify send email.", good: false },
  error: { text: "Google permission could not be updated. Please try again.", good: false },
};

async function LeadView({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gmail?: string | string[] }> }) {
  const session = await auth();
  if (!session?.tenantId) return null;
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const db = getDb();
  const lead = await getLead(db, session.tenantId, id);
  if (!lead) notFound();
  // Only the draft that already exists is read here. Writing a new one (an AI call) happens when the
  // review panel asks for it in the browser, so merely rendering or prefetching this page never costs credits.
  const [draft, { timeZone }] = await Promise.all([getOpenDraft(db, session.tenantId, lead.id), getTodayWindow(db, session.tenantId)]);
  const notice = typeof query.gmail === "string" ? GMAIL_NOTICES[query.gmail] : undefined;

  return (
    <div className="grid gap-5">
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold">{lead.contactName ?? lead.contactEmail}</h1>
          <TemperatureChip temperature={lead.temperature} />
        </div>
        <p className="text-sm text-muted-foreground">{lead.contactEmail}</p>
        {lead.reason ? <p className="text-sm">{lead.reason}</p> : null}
      </header>

      {notice ? (
        <p role="status" className={notice.good ? "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm" : "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"}>
          {notice.text}
        </p>
      ) : null}

      {lead.email ? (
        <section className="grid gap-2 rounded-xl border bg-card p-4" aria-label="Their last email">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="font-medium">{lead.email.subject || "(no subject)"}</h2>
            <span className="text-xs text-muted-foreground">{formatMailTime(lead.email.receivedAt, timeZone)}</span>
          </div>
          {/* Plain text only: mail is never rendered as HTML. */}
          <p className="max-h-64 overflow-y-auto text-sm whitespace-pre-wrap wrap-break-word text-muted-foreground">{lead.email.bodyText || "(no text)"}</p>
          <Link href={`/dashboard/mail/${lead.email.id}`} className="justify-self-start rounded-sm text-xs underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 active:opacity-70">
            Open the email
          </Link>
        </section>
      ) : (
        <p className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">Their email is no longer here, so there is nothing to reply to.</p>
      )}

      {lead.email ? (
        <DraftReview
          leadId={lead.id}
          from={lead.mailbox ?? ""}
          to={lead.contactEmail}
          initial={draft ? { id: draft.id, subject: draft.subject, body: draft.body, status: draft.status, errorCode: draft.errorCode } : null}
        />
      ) : null}
    </div>
  );
}

export default function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gmail?: string | string[] }> }) {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <Link href="/dashboard/leads" className="inline-flex items-center gap-1.5 justify-self-start rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:opacity-70">
        <ArrowLeft className="size-4" />
        Leads
      </Link>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <LeadView params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
