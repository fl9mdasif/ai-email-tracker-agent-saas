import { CheckCheck } from "lucide-react";
import { Suspense } from "react";
import { auth } from "@/core/auth";
import { getDb } from "@/core/db";
import { EmptyState } from "@/components/mail/empty-state";
import { MailRowItem } from "@/components/mail/mail-row";
import { listNeedsReply } from "@/modules/email-tracker/queries/dashboard";
import { getTodayWindow } from "@/modules/email-tracker/scan/scan-state";
import { HandledButton, RemindMenu } from "../mail-controls";
import { MailSkeleton } from "../mail-skeleton";

async function NeedsReplyList() {
  const session = await auth();
  if (!session?.tenantId) return null;
  const db = getDb();
  const [rows, { timeZone }] = await Promise.all([listNeedsReply(db, session.tenantId), getTodayWindow(db, session.tenantId)]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CheckCheck}
        title="You're all caught up"
        text="Mail the AI thinks needs a reply shows up here until you mark it handled."
      />
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {rows.length} {rows.length === 1 ? "email needs" : "emails need"} a reply, most urgent first.
      </p>
      <ul className="grid gap-2">
        {rows.map((mail) => (
          <MailRowItem
            key={mail.id}
            mail={mail}
            timeZone={timeZone}
            actions={
              <>
                <RemindMenu emailId={mail.id} />
                <HandledButton emailId={mail.id} handled={false} />
              </>
            }
          />
        ))}
      </ul>
    </>
  );
}

export default function NeedsReplyPage() {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4">
      <header className="grid gap-1">
        <h1 className="font-display text-2xl font-semibold">Needs reply</h1>
        <p className="text-sm text-muted-foreground">Everything the AI says is waiting for your answer. Replies are never sent for you.</p>
      </header>
      <Suspense fallback={<MailSkeleton />}>
        <NeedsReplyList />
      </Suspense>
    </div>
  );
}
