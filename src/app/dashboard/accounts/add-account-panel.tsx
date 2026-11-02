"use client";

import { Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { ProviderLogo } from "@/components/brand/provider-logo";
import { Card, CardContent } from "@/components/ui/card";
import { BRAND_KEYS, PROVIDER_BRANDS } from "@/modules/email-tracker/providers/brands";
import { AddAccountForm, type PresetOption } from "./add-account-form";

const available = BRAND_KEYS.filter((key) => PROVIDER_BRANDS[key].availability === "now");
const soon = BRAND_KEYS.filter((key) => PROVIDER_BRANDS[key].availability === "soon");

/**
 * A call-to-action card that says what can be added, with a coloured "+ Add a new account"
 * button. The form opens in its place, with a close button, and closes itself after saving.
 */
export function AddAccountPanel({ presets }: { presets: PresetOption[] }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  if (open) return <AddAccountForm presets={presets} onClose={close} onSaved={close} />;

  return (
    <Card className="border-dashed bg-[color-mix(in_oklab,var(--primary)_4%,var(--card))]">
      <CardContent className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="grid gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Add more accounts</h2>
            <p className="text-sm text-muted-foreground">
              Connect another mailbox so Loopify can sort its mail too. Each account keeps its own
              logo and status.
            </p>
          </div>

          <div className="grid gap-2">
            <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">You can add now</p>
            <ul className="flex flex-wrap gap-2">
              {available.map((key) => (
                <li
                  key={key}
                  className="flex items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1 text-sm font-medium shadow-sm"
                >
                  <ProviderLogo brand={key} size={28} />
                  {PROVIDER_BRANDS[key].name}
                </li>
              ))}
            </ul>
            <p className="mt-1 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Coming soon</p>
            <ul className="flex flex-wrap gap-2">
              {soon.map((key) => (
                <li
                  key={key}
                  className="flex items-center gap-2 rounded-full border border-dashed py-1 pr-3 pl-1 text-sm text-muted-foreground opacity-80"
                >
                  <span className="grayscale">
                    <ProviderLogo brand={key} size={24} />
                  </span>
                  {PROVIDER_BRANDS[key].name}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <button
          type="button"
          aria-expanded={false}
          onClick={() => setOpen(true)}
          className="btn-gradient inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-7 text-base font-semibold text-white transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:w-auto"
        >
          <Plus className="size-5" />
          Add a new account
        </button>
      </CardContent>
    </Card>
  );
}
