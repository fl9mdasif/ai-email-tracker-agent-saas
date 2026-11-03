import { ChevronRight, Flame } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/core/auth";
import { getDb } from "@/core/db";
import { formatMailTime } from "@/core/lib/time";
import { EmptyState } from "@/components/mail/empty-state";
import type { LeadTemperature } from "@/modules/email-tracker/db/schema";
import { type LeadRow, listLeads } from "@/modules/email-tracker/queries/leads";
import { getTodayWindow } from "@/modules/email-tracker/scan/scan-state";
import { MailSkeleton } from "../mail-skeleton";
import { ScoreOlderButton } from "./score-older-button";
import { TemperatureChip } from "./temperature";

const GROUPS: Array<{ temperature: LeadTemperature; title: string }> = [
  { temperature: "hot", title: "Hot" },
  { temperature: "warm", title: "Warm" },
  { temperature: "cold", title: "Cold" },
];

function LeadItem({ lead, timeZone }: { lead: LeadRow; timeZone: string }) {
  return (
    <li>
      <Link
        href={`/dashboard/leads/${lead.id}`}
        className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 outline-none transition-colors hover:bg-muted/50 active:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-medium">{lead.contactName ?? lead.contactEmail}</span>
            <TemperatureChip temperature={lead.temperature} />
          </div>
          {lead.reason ? <p className="text-sm">{lead.reason}</p> : null}
          <p className="truncate text-xs text-muted-foreground">
            {lead.subject ? `${lead.subject}, ` : ""}
            {lead.lastEmailAt ? formatMailTime(lead.lastEmailAt, timeZone) : ""}
            {lead.mailbox ? `, to ${lead.mailbox}` : ""}
          </p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

async function Leads() {
  const session = await auth();
  if (!session?.tenantId) return null;
  const db = getDb();
  const [{ leads, snoozed }, { timeZone }] = await Promise.all([listLeads(db, session.tenantId), getTodayWindow(db, session.tenantId)]);

  if (leads.length === 0) {
    return (
      <EmptyState
        icon={Flame}
        title={snoozed > 0 ? "No leads waiting" : "No leads yet"}
        text={
          snoozed > 0
            ? `${snoozed} ${snoozed === 1 ? "lead is" : "leads are"} resting after a follow-up or Skip, and will come back in a few days.`
            : "When a prospect writes to you, the AI scores them hot, warm or cold during its scan and they show up here."
        }
      >
        <div className="mt-2">
          <ScoreOlderButton />
        </div>
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-6">
      {GROUPS.map(({ temperature, title }) => {
        const items = leads.filter((lead) => lead.temperature === temperature);
        if (items.length === 0) return null;
        return (
          <section key={temperature} className="grid gap-2" aria-label={`${title} leads`}>
            <h2 className="font-display text-base font-semibold">
              {title} <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
            </h2>
            <ul className="grid gap-2">
              {items.map((lead) => (
                <LeadItem key={lead.id} lead={lead} timeZone={timeZone} />
              ))}
            </ul>
          </section>
        );
      })}
      <div className="grid gap-2 border-t pt-4 text-sm text-muted-foreground">
        {snoozed > 0 ? (
          <p>
            {snoozed} more {snoozed === 1 ? "lead is" : "leads are"} resting after a follow-up or Skip.
          </p>
        ) : null}
        <ScoreOlderButton />
      </div>
    </div>
  );
}

export default function LeadsPage() {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4">
      <header className="grid gap-1">
        <h1 className="font-display text-2xl font-semibold">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Prospects the AI found in your mail, hottest first. Open one to review a follow-up the AI drafts. Nothing is sent until you press Send.
        </p>
      </header>
      <Suspense fallback={<MailSkeleton />}>
        <Leads />
      </Suspense>
    </div>
  );
}
