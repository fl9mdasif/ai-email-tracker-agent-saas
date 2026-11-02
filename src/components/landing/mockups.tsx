import { Check, Pencil, RefreshCw, Send, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";

function MockWindow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-xl shadow-primary/5">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-red-400/80" />
        <span className="size-2.5 rounded-full bg-amber-400/80" />
        <span className="size-2.5 rounded-full bg-green-400/80" />
        <span className="ml-2 text-xs text-muted-foreground">{title}</span>
      </div>
      <div className="p-4 md:p-5">{children}</div>
    </div>
  );
}

const PROVIDERS = [
  { name: "Gmail", how: "Sign in with Google" },
  { name: "Outlook", how: "Sign in with Microsoft" },
  { name: "Zoho Mail", how: "IMAP + app password" },
  { name: "Hostinger", how: "IMAP + app password" },
  { name: "Instantly", how: "API key" },
  { name: "Apollo", how: "API key" },
];

export function ConnectMock() {
  return (
    <MockWindow title="Connected accounts (sample)">
      <ul className="flex flex-col gap-2">
        {PROVIDERS.map((provider) => (
          <li
            key={provider.name}
            className="flex items-center justify-between rounded-lg border px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium">{provider.name}</p>
              <p className="text-xs text-muted-foreground">{provider.how}</p>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300">
              <Check className="size-3" /> Connected
            </span>
          </li>
        ))}
      </ul>
    </MockWindow>
  );
}

const CHIP = {
  hot: "bg-red-500/15 text-red-700 dark:text-red-300",
  reply: "bg-brand/15 text-brand dark:text-brand-light",
  pay: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  fyi: "bg-brand-teal/15 text-brand-teal-text dark:text-brand-teal",
} as const;

const SORTED = [
  { from: "Maria Gomez", subject: "Pricing for 20 seats?", label: "Lead replied", chip: "hot", p: 1 },
  { from: "Accounts", subject: "Invoice #4821 due Friday", label: "Invoice", chip: "pay", p: 1 },
  { from: "Rahim", subject: "Re: proposal draft", label: "Needs reply", chip: "reply", p: 2 },
  { from: "Weekly Digest", subject: "Ten tips for better sales", label: "Newsletter", chip: "fyi", p: 3 },
] as const;

export function SortMock() {
  return (
    <MockWindow title="Today, sorted by priority (sample)">
      <ul className="flex flex-col gap-2">
        {SORTED.map((mail) => (
          <li key={mail.subject} className="flex items-center gap-3 rounded-lg border px-3 py-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold">
              P{mail.p}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{mail.subject}</p>
              <p className="truncate text-xs text-muted-foreground">{mail.from}</p>
            </div>
            <span
              className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", CHIP[mail.chip])}
            >
              {mail.label}
            </span>
          </li>
        ))}
      </ul>
    </MockWindow>
  );
}

export function ChatMock() {
  return (
    <MockWindow title="Ask your inbox (sample)">
      <div className="flex flex-col gap-3 text-sm">
        <p className="self-end rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-primary-foreground">
          What needs my action today?
        </p>
        <div className="max-w-[90%] self-start rounded-2xl rounded-bl-sm border bg-muted/40 px-4 py-3">
          <p className="mb-2">Here is your day:</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>3 emails are waiting for a reply</li>
            <li>2 follow-ups are overdue</li>
            <li>1 lead asked for a call</li>
          </ul>
        </div>
        <p className="self-end rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-primary-foreground">
          Show my hot leads
        </p>
      </div>
    </MockWindow>
  );
}

export function DraftMock() {
  return (
    <MockWindow title="Review follow-up (sample)">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Maria Gomez</p>
            <p className="text-xs text-muted-foreground">Asked for pricing and a call</p>
          </div>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", CHIP.hot)}>Hot</span>
        </div>
        <p className="rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed text-muted-foreground">
          Hi Maria, thanks for your interest. For 20 seats the plan is simple to set up, and I can
          walk you through it on a short call. Does Thursday at 11:00 work for you?
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Edit", icon: Pencil },
            { label: "Regenerate", icon: RefreshCw },
            { label: "Skip", icon: SkipForward },
          ].map(({ label, icon: Icon }) => (
            <span
              key={label}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs"
            >
              <Icon className="size-3.5" /> {label}
            </span>
          ))}
          <span className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
            <Send className="size-3.5" /> Send
          </span>
        </div>
        <p className="text-xs text-muted-foreground">One click sends one email. Never automatic.</p>
      </div>
    </MockWindow>
  );
}
