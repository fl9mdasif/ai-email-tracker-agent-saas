import { Suspense } from "react";
import { IMAP_PRESET_KEYS, IMAP_PRESETS } from "@/modules/email-tracker/connectors/imap/presets";
import { AccountsList } from "./accounts-list";
import { AccountsSkeleton } from "./accounts-skeleton";
import { AddAccountPanel } from "./add-account-panel";
import { GmailNotice } from "./gmail-notice";

const presetOptions = IMAP_PRESET_KEYS.map((key) => ({ key, label: IMAP_PRESETS[key].label }));

export default function AccountsPage({ searchParams }: { searchParams: Promise<{ gmail?: string }> }) {
  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-display text-2xl font-semibold">Accounts</h1>
        <p className="text-sm text-muted-foreground">
          Connect the mailboxes Loopify should read. Nothing is ever sent without your click.
        </p>
      </header>
      <Suspense fallback={null}>
        <GmailNotice searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<AccountsSkeleton />}>
        <AccountsList />
      </Suspense>
      <AddAccountPanel presets={presetOptions} />
    </div>
  );
}
