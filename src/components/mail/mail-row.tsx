import Link from "next/link";
import { formatMailTime } from "@/core/lib/time";
import { cn } from "@/lib/utils";
import type { MailRow } from "@/modules/email-tracker/queries/dashboard";
import { AccountBadge, CategoryChip, PriorityChip } from "./chips";

/**
 * One email in a list: sender, subject (a link to the full mail), what the AI made of it, the
 * mailbox it came from, and an optional row of actions. Cards stack on a phone.
 */
export function MailRowItem({
  mail,
  timeZone,
  actions,
  note,
}: {
  mail: MailRow;
  timeZone: string;
  /** Buttons shown under the mail (Mark handled, Remind me, ...). */
  actions?: React.ReactNode;
  /** A short line above the mail, e.g. why it is a follow-up. */
  note?: string;
}) {
  const unread = mail.status === "unread";
  return (
    <li className={cn("grid gap-2 rounded-xl border bg-card p-4", mail.handled && "opacity-70")}>
      {note ? <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{note}</p> : null}

      <div className="flex items-baseline justify-between gap-3">
        <p className={cn("min-w-0 truncate text-sm", unread && "font-semibold")}>
          {unread ? <span aria-label="Unread" className="mr-1.5 inline-block size-2 rounded-full bg-brand align-middle" /> : null}
          {mail.fromName ?? mail.fromAddress}
        </p>
        <p className="shrink-0 text-xs text-muted-foreground">{formatMailTime(mail.receivedAt, timeZone)}</p>
      </div>

      <Link href={`/dashboard/mail/${mail.id}`} className={cn("text-sm hover:underline", unread ? "font-medium" : "")}>
        {mail.subject || "(no subject)"}
      </Link>

      {mail.analysis ? (
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryChip category={mail.analysis.category} />
            <PriorityChip priority={mail.analysis.priority} />
            {mail.handled ? <span className="text-xs text-muted-foreground">Handled</span> : null}
          </div>
          <p className="text-sm text-muted-foreground">{mail.analysis.summary}</p>
          <p className="text-sm">
            <span className="font-medium">Next: </span>
            {mail.analysis.suggestedAction}
          </p>
        </div>
      ) : (
        <p className="line-clamp-2 text-sm text-muted-foreground">{mail.snippet}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <AccountBadge account={mail.account} />
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </li>
  );
}
