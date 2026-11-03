import { ProviderLogo } from "@/components/brand/provider-logo";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, PRIORITY_LABELS } from "@/modules/email-tracker/ai/labels";
import type { EmailCategory } from "@/modules/email-tracker/ai/schema";

const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export function CategoryChip({ category }: { category: EmailCategory }) {
  const entry = CATEGORY_LABELS[category];
  return <span className={cn(chip, entry.chip)}>{entry.label}</span>;
}

export function PriorityChip({ priority }: { priority: number }) {
  const entry = PRIORITY_LABELS[priority] ?? PRIORITY_LABELS[3];
  return <span className={cn(chip, entry.chip)}>{entry.label}</span>;
}

/** Which mailbox a mail came from: its logo and address. */
export function AccountBadge({ account }: { account: { identity: string; brand: string | null } }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <ProviderLogo brand={account.brand} size={18} />
      <span className="truncate">{account.identity}</span>
    </span>
  );
}
