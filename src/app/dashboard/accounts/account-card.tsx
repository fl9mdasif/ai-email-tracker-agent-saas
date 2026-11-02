import { ProviderLogo } from "@/components/brand/provider-logo";
import { cn } from "@/lib/utils";
import { PROVIDER_BRANDS, isBrandKey } from "@/modules/email-tracker/providers/brands";
import { DisconnectButton } from "./disconnect-button";
import { SyncNowButton } from "./sync-now-button";

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export type AccountCardData = {
  id: string;
  brand: string | null;
  label: string;
  identity: string;
  status: "connected" | "error";
  statusMessage: string | null;
  createdAt: Date;
  lastSyncedAt: Date | null;
};

/**
 * One connected account, branded with its provider: logo tile with a green "active" circle,
 * the provider name, an Active pill, and a tinted card with a coloured left edge, so it is
 * obvious from a distance which provider the account belongs to.
 */
export function AccountCard({
  account,
  storedCount,
  lastRun,
}: {
  account: AccountCardData;
  storedCount: number;
  /** What the latest check found, e.g. "No new mail" or "3 new emails". */
  lastRun: string | null;
}) {
  const brand = isBrandKey(account.brand) ? PROVIDER_BRANDS[account.brand] : null;
  const active = account.status === "connected";

  return (
    <li
      style={brand ? ({ "--brand": brand.color } as React.CSSProperties) : undefined}
      className={cn(
        "rounded-xl border bg-card p-4 sm:p-5",
        // The brand edge is always there. The brand tint is only for healthy accounts, so an
        // error never looks like the provider's own colour (Zoho's brand colour is red).
        brand &&
          "border-l-4 [border-color:color-mix(in_oklab,var(--brand)_35%,var(--border))] [border-left-color:var(--brand)]",
        brand && active && "bg-[color-mix(in_oklab,var(--brand)_8%,var(--card))]",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <ProviderLogo brand={account.brand} size={60} status={active ? "active" : "error"} />

        <div className="min-w-0 flex-1 basis-48">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl font-semibold">{brand?.name ?? "Email account"}</h3>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                active
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-red-500/15 text-red-700 dark:text-red-300",
              )}
            >
              <span className={cn("size-2 rounded-full", active ? "animate-pulse-dot bg-emerald-500" : "bg-red-500")} />
              {active ? "Active" : "Needs attention"}
            </span>
          </div>
          <p className="truncate text-sm">
            <span className="font-medium">{account.label}</span>
            <span className="text-muted-foreground"> · {account.identity}</span>
          </p>
          <p className="text-sm text-muted-foreground">Added {dateFormat.format(account.createdAt)}</p>
        </div>

        {/* Full width under the details on a phone, to the right on larger screens. */}
        <div className="flex items-start gap-2 max-sm:basis-full">
          <SyncNowButton accountId={account.id} />
          <DisconnectButton accountId={account.id} label={account.label} />
        </div>
      </div>

      <dl className="mt-4 grid gap-3 border-t pt-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Stored</dt>
          <dd className="font-medium">
            {storedCount} {storedCount === 1 ? "email" : "emails"}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Last checked</dt>
          <dd className="font-medium">
            {account.lastSyncedAt ? `${dateTimeFormat.format(account.lastSyncedAt)} UTC` : "Not synced yet"}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Last check found</dt>
          <dd className="font-medium">{lastRun ?? "Nothing yet"}</dd>
        </div>
      </dl>

      {!active && account.statusMessage ? (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-destructive">{account.statusMessage}</p>
      ) : null}
    </li>
  );
}
