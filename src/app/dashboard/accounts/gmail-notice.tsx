import { CheckCircle2, CircleAlert } from "lucide-react";

const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Gmail connected. Mail is being fetched now; it will show on Today in a moment." },
  reconnected: { ok: true, text: "Gmail reconnected. Mail is being fetched again." },
  denied: { ok: false, text: "Gmail was not connected: access was not allowed on the Google screen." },
  error: { ok: false, text: "Gmail could not be connected. Please try again." },
  api_disabled: {
    ok: false,
    text: "Gmail could not be connected: the Gmail API is switched off for this app. In Google Cloud open APIs & Services, Library, Gmail API and press Enable, wait a minute, then press Connect Gmail again.",
  },
  scope: {
    ok: false,
    text: "Gmail could not be connected: mail access was not granted. Press Connect Gmail again and, on the Google screen, tick the box that lets Loopify view your email messages before pressing Continue.",
  },
};

/** The result of the last "Connect Gmail" attempt, passed back in the address as ?gmail=... */
export async function GmailNotice({ searchParams }: { searchParams: Promise<{ gmail?: string }> }) {
  const { gmail } = await searchParams;
  const message = gmail ? MESSAGES[gmail] : undefined;
  if (!message) return null;

  const Icon = message.ok ? CheckCircle2 : CircleAlert;
  return (
    <div
      role="status"
      className={
        message.ok
          ? "flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300"
          : "flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300"
      }
    >
      <Icon className="size-4 shrink-0" />
      <p>{message.text}</p>
    </div>
  );
}
