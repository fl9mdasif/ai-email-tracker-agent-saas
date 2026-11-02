import { IMAP_PRESET_KEYS, IMAP_PRESETS } from "@/modules/email-tracker/connectors/imap/presets";
import { AddAccountForm } from "./add-account-form";

const presetOptions = IMAP_PRESET_KEYS.map((key) => ({ key, label: IMAP_PRESETS[key].label }));

export default function AccountsPage() {
  return (
    <div className="grid gap-8">
      <header className="grid gap-1">
        <h1 className="font-display text-2xl font-semibold">Accounts</h1>
        <p className="text-sm text-muted-foreground">
          Connect the mailboxes Loopify should read. Nothing is ever sent without your click.
        </p>
      </header>
      <AddAccountForm presets={presetOptions} />
    </div>
  );
}
