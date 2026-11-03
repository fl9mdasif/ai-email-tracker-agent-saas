import { CalendarCheck } from "lucide-react";
import { Suspense } from "react";
import { auth } from "@/core/auth";
import { getDb } from "@/core/db";
import { formatMailTime } from "@/core/lib/time";
import { EmptyState } from "@/components/mail/empty-state";
import { MailRowItem } from "@/components/mail/mail-row";
import { type FollowUpRow, listFollowUps } from "@/modules/email-tracker/queries/dashboard";
import { getTodayWindow } from "@/modules/email-tracker/scan/scan-state";
import { FollowUpButtons } from "../mail-controls";
import { MailSkeleton } from "../mail-skeleton";

function Section({ title, tone, items, timeZone }: { title: string; tone?: "alert"; items: FollowUpRow[]; timeZone: string }) {
  if (items.length === 0) return null;
  return (
    <section className="grid gap-2" aria-label={title}>
      <h2 className={tone === "alert" ? "font-display text-base font-semibold text-red-700 dark:text-red-300" : "font-display text-base font-semibold"}>
        {title} <span className="text-xs font-normal text-muted-foreground">· {items.length}</span>
      </h2>
      <ul className="grid gap-2">
        {items.map((item) => (
          <MailRowItem
            key={item.id}
            mail={item.mail}
            timeZone={timeZone}
            note={`${item.source === "ai" ? "AI suggests a follow-up" : "Your reminder"} · due ${formatMailTime(item.dueAt, timeZone)}${item.reason ? ` · ${item.reason}` : ""}`}
            actions={<FollowUpButtons followUpId={item.id} />}
          />
        ))}
      </ul>
    </section>
  );
}

async function FollowUps() {
  const session = await auth();
  if (!session?.tenantId) return null;
  const db = getDb();
  const [groups, { timeZone }] = await Promise.all([listFollowUps(db, session.tenantId), getTodayWindow(db, session.tenantId)]);

  if (groups.overdue.length + groups.today.length + groups.upcoming.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No follow-ups"
        text="The AI adds mail that needs a follow-up here, and you can add your own with Remind me on any email."
      />
    );
  }

  return (
    <div className="grid gap-6">
      <Section title="Overdue" tone="alert" items={groups.overdue} timeZone={timeZone} />
      <Section title="Due today" items={groups.today} timeZone={timeZone} />
      <Section title="Upcoming" items={groups.upcoming} timeZone={timeZone} />
    </div>
  );
}

export default function FollowUpsPage() {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4">
      <header className="grid gap-1">
        <h1 className="font-display text-2xl font-semibold">Follow-ups</h1>
        <p className="text-sm text-muted-foreground">Mail the AI says needs a follow-up, plus your own reminders.</p>
      </header>
      <Suspense fallback={<MailSkeleton />}>
        <FollowUps />
      </Suspense>
    </div>
  );
}
