export type Provider = { name: string; color: string };

/** Mail and outreach sources shown on the homepage. Accent colours only; no trademarked logos. */
export const PROVIDERS: readonly Provider[] = [
  { name: "Gmail", color: "#ea4335" },
  { name: "Outlook", color: "#2b88d8" },
  { name: "Zoho Mail", color: "#f59e0b" },
  { name: "Hostinger", color: "#7c4dff" },
  { name: "Instantly", color: "#38bdf8" },
  { name: "Apollo", color: "#facc15" },
  { name: "Brevo", color: "#22c55e" },
];

export type SampleMail = { from: string; subject: string; chip: string; chipColor: string };

/** Generic sample content for the decorative cards (no real people or addresses). */
export const SAMPLE_MAILS: readonly SampleMail[] = [
  { from: "Maria Gomez", subject: "Pricing for 20 seats?", chip: "HOT LEAD", chipColor: "#ef4444" },
  { from: "Accounts", subject: "Invoice #4821 due Friday", chip: "INVOICE", chipColor: "#f5a524" },
  { from: "Rahim", subject: "Re: proposal draft", chip: "REPLY", chipColor: "#7c6cff" },
  { from: "Weekly Digest", subject: "Ten tips for better sales", chip: "FYI", chipColor: "#38bdf8" },
];
