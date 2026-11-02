import { BellRing, Briefcase, Inbox, MessageSquare, Smartphone, Users } from "lucide-react";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

const CASES = [
  {
    icon: Inbox,
    who: "Business owners",
    title: "A busy inbox, finally under control",
    points: [
      "See what came in today in one sorted list",
      "Know which emails need a reply and which can wait",
      "Get a one-line summary instead of reading every thread",
    ],
  },
  {
    icon: Users,
    who: "Teams running cold outreach",
    title: "Never lose a lead who replied",
    points: [
      "Instantly and Apollo replies appear next to your inbox",
      "Leads are scored hot, warm or cold with a short reason",
      "Overdue follow-ups are listed so nobody is forgotten",
    ],
  },
  {
    icon: Briefcase,
    who: "Agencies and consultants",
    title: "Several mailboxes, one clear view",
    points: [
      "Connect Gmail, Outlook, Zoho and Hostinger accounts together",
      "Ask which client needs an answer first",
      "Draft replies in the same language and tone as the thread",
    ],
  },
];

const EXTRAS = [
  { icon: BellRing, label: "Daily digest with push notifications" },
  { icon: Smartphone, label: "Installs on your phone like an app" },
  { icon: MessageSquare, label: "Ask questions in plain language" },
];

export function UseCases() {
  return (
    <section id="use-cases" className="scroll-mt-20 border-y bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <SectionHeading
          eyebrow="Use cases"
          title="Built for people who answer email for a living"
          body="Whether you run a business or an outreach campaign, the app answers one question first: what should I do today?"
        />
        <ul className="grid gap-5 md:grid-cols-3">
          {CASES.map((item, index) => (
            <li key={item.who}>
              <Reveal delay={index * 0.08} className="h-full">
                <article className="flex h-full flex-col gap-4 rounded-2xl border bg-card p-6 transition-shadow hover:shadow-lg hover:shadow-primary/10">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
                    <item.icon className="size-5" />
                  </span>
                  <p className="text-sm font-medium text-primary">{item.who}</p>
                  <h3 className="text-xl font-semibold tracking-tight text-balance">{item.title}</h3>
                  <ul className="mt-auto flex flex-col gap-2 text-sm text-muted-foreground">
                    {item.points.map((point) => (
                      <li key={point} className="flex gap-2">
                        <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            </li>
          ))}
        </ul>
        <Reveal className="mt-10">
          <ul className="flex flex-wrap justify-center gap-3">
            {EXTRAS.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm"
              >
                <Icon className="size-4 text-primary" />
                {label}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
