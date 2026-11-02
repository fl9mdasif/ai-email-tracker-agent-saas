import { Eye, Lock, MousePointerClick, ShieldCheck, Trash2, Building2 } from "lucide-react";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

const PILLARS = [
  {
    icon: MousePointerClick,
    title: "Nothing sends without your click",
    body: "The AI reads, suggests and drafts. Every email is sent only after you review it and click Send, one email at a time. There is no auto-send and no bulk send.",
  },
  {
    icon: Eye,
    title: "Read-only by default",
    body: "Gmail and Outlook connect with read-only access. Send permission is requested separately, and only when you click Send for the first time, with an explanation.",
  },
  {
    icon: Lock,
    title: "Credentials are encrypted",
    body: "API keys, app passwords and tokens are encrypted with AES-256-GCM before they are stored, and are never shown again or logged.",
  },
  {
    icon: Building2,
    title: "Your workspace is isolated",
    body: "Every record belongs to your workspace, and every query is scoped to it. Other customers can never see your mail or leads.",
  },
  {
    icon: ShieldCheck,
    title: "Emails are treated as untrusted",
    body: "Email text is wrapped and the AI is told never to follow instructions found inside a message, so a malicious email cannot steer it.",
  },
  {
    icon: Trash2,
    title: "Disconnect and delete anytime",
    body: "Remove an account in one click. Its stored credentials are deleted, and you can choose to delete the synced data as well.",
  },
];

export function Trust() {
  return (
    <section id="trust" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 md:py-28">
      <SectionHeading
        eyebrow="Trust and security"
        title="The AI suggests. You decide."
        body="Your inbox is private and important, so the app is designed to keep you in control at every step."
      />
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PILLARS.map((pillar, index) => (
          <li key={pillar.title}>
            <Reveal delay={(index % 3) * 0.08} className="h-full">
              <article className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-6">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
                  <pillar.icon className="size-5" />
                </span>
                <h3 className="text-lg font-semibold tracking-tight">{pillar.title}</h3>
                <p className="text-sm text-muted-foreground text-pretty">{pillar.body}</p>
              </article>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
