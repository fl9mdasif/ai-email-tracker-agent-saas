import { ProviderLogo } from "@/components/brand/provider-logo";
import { cn } from "@/lib/utils";
import {
  type BrandKey,
  PROVIDER_BRANDS,
  isBrandKey,
} from "@/modules/email-tracker/providers/brands";

/** Available providers first, then the ones that arrive with later milestones. */
const DISPLAY_ORDER: BrandKey[] = ["hostinger", "zoho", "gmail", "outlook", "instantly", "apollo", "brevo"];

/**
 * One tile per provider so it is clear at a glance which ones are connected: connected
 * providers are in full colour with a green active circle, the rest are dashed or greyed.
 */
export function ConnectedProviders({
  accounts,
}: {
  accounts: Array<{ brand: string | null; status: "connected" | "error" }>;
}) {
  const counts = new Map<BrandKey, { total: number; failing: number }>();
  for (const account of accounts) {
    if (!isBrandKey(account.brand)) continue;
    const entry = counts.get(account.brand) ?? { total: 0, failing: 0 };
    entry.total += 1;
    if (account.status === "error") entry.failing += 1;
    counts.set(account.brand, entry);
  }

  return (
    <section aria-label="Providers">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {DISPLAY_ORDER.map((key) => {
          const brand = PROVIDER_BRANDS[key];
          const entry = counts.get(key);
          const connected = Boolean(entry);
          const soon = brand.availability === "soon" && !connected;
          const label = connected
            ? entry!.failing > 0
              ? "Needs attention"
              : `${entry!.total} connected`
            : soon
              ? "Soon"
              : "Not connected";

          return (
            <li
              key={key}
              style={{ "--brand": brand.color } as React.CSSProperties}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border p-3 text-center",
                connected &&
                  !entry!.failing &&
                  "bg-[color-mix(in_oklab,var(--brand)_9%,var(--card))] [border-color:color-mix(in_oklab,var(--brand)_55%,transparent)] shadow-sm",
                connected && entry!.failing > 0 && "border-red-500/60 bg-card shadow-sm",
                !connected && !soon && "border-dashed bg-card",
                soon && "bg-card opacity-60",
              )}
            >
              <span className={cn(soon && "grayscale")}>
                <ProviderLogo
                  brand={key}
                  size={44}
                  status={connected ? (entry!.failing > 0 ? "error" : "active") : undefined}
                />
              </span>
              <span className="text-sm font-medium">{brand.name}</span>
              <span
                className={cn(
                  "text-xs",
                  connected
                    ? entry!.failing > 0
                      ? "font-medium text-destructive"
                      : "font-medium text-emerald-700 dark:text-emerald-300"
                    : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
