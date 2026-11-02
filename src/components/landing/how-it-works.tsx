import { cn } from "@/lib/utils";
import { ChatMock, ConnectMock, DraftMock, SortMock } from "./mockups";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

const STEPS = [
  {
    title: "Connect your inboxes and outreach tools",
    body: "Link Gmail, Outlook, Zoho or Hostinger mail, plus Instantly and Apollo for cold outreach. Setup takes minutes, and you can disconnect any account whenever you like.",
    mock: <ConnectMock />,
  },
  {
    title: "AI sorts and prioritizes everything",
    body: "Every new email is classified, given a priority from 1 to 3, summarized in one sentence, and paired with a suggested next action. Lead replies and payments never get buried.",
    mock: <SortMock />,
  },
  {
    title: "Ask in plain language",
    body: "Ask what came in today, who needs a follow-up, or which leads replied. The app finds the right emails first, then answers from just those.",
    mock: <ChatMock />,
  },
  {
    title: "Review the draft, then click Send",
    body: "For hot leads the AI writes a follow-up in your tone and language, using the real thread. You edit it, regenerate it or skip it. It sends only when you click Send.",
    mock: <DraftMock />,
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 md:py-28">
      <SectionHeading
        eyebrow="How it works"
        title="From a noisy inbox to a clear to-do list"
        body="Four steps, and you stay in control of every message that leaves."
      />
      <ol className="flex flex-col gap-20 md:gap-28">
        {STEPS.map((step, index) => (
          <li key={step.title} className="grid items-center gap-8 md:grid-cols-2 md:gap-14">
            <Reveal className={cn("flex flex-col gap-4", index % 2 === 1 && "md:order-2")}>
              <span className="grid size-10 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                {index + 1}
              </span>
              <h3 className="text-2xl font-semibold tracking-tight text-balance">{step.title}</h3>
              <p className="text-pretty text-muted-foreground">{step.body}</p>
            </Reveal>
            <Reveal delay={0.1}>{step.mock}</Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}
