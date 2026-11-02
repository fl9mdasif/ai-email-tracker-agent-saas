import type { EmailCategory } from "./schema";

/** How each category is named and coloured in the interface. */
export const CATEGORY_LABELS: Record<EmailCategory, { label: string; chip: string }> = {
  needs_reply: { label: "Needs reply", chip: "bg-brand/15 text-brand dark:text-brand-light" },
  follow_up_needed: { label: "Follow-up", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  lead_reply: { label: "Lead replied", chip: "bg-red-500/15 text-red-700 dark:text-red-300" },
  invoice_or_payment: { label: "Invoice / payment", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  newsletter_or_promo: { label: "Newsletter", chip: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
  fyi_only: { label: "FYI", chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  spam: { label: "Spam", chip: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300" },
};

export const PRIORITY_LABELS: Record<number, { label: string; chip: string }> = {
  1: { label: "P1 Today", chip: "bg-foreground text-background" },
  2: { label: "P2 Soon", chip: "border border-border text-foreground" },
  3: { label: "P3 Later", chip: "border border-dashed border-border text-muted-foreground" },
};
