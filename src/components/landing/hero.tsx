import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PROVIDERS } from "./providers";

const STATS = [
  { value: "AES-256", label: "Credential encryption" },
  { value: "3", label: "Priority levels" },
  { value: "1 click", label: "To send, never automatic" },
  { value: "0", label: "Emails sent without you" },
];

const INTEGRATIONS = PROVIDERS.map((provider) => provider.name);

/** Full-bleed dark hero. The 3D (or static) visual sits behind the text on the right. */
export function Hero({ visual }: { visual: React.ReactNode }) {
  return (
    <section className="relative isolate flex min-h-[calc(100svh-3.5rem)] flex-col overflow-hidden bg-[#0a0f23] text-white">
      {/* visual layer */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="absolute inset-y-0 right-0 w-full opacity-50 md:w-[66%] md:opacity-100">
          {visual}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a0f23] via-[#0a0f23]/75 to-transparent md:via-[#0a0f23]/50" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0a0f23] to-transparent" />
        <div className="dot-grid pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -top-40 -left-32 size-[520px] rounded-full bg-[#6b21a8]/30 blur-[120px]" />
        <div className="pointer-events-none absolute -right-32 bottom-0 size-[480px] rounded-full bg-[#1d4ed8]/25 blur-[120px]" />
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 pt-16 pb-10 md:pt-20">
        <p className="hero-anim hero-anim-d1 inline-flex w-fit items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 font-mono text-[11px] tracking-[0.18em] text-white/80 uppercase backdrop-blur-md">
          <span className="animate-pulse-dot size-2 rounded-full bg-emerald-400" />
          AI inbox assistant
        </p>

        <h1
          className="mt-8 max-w-4xl font-display leading-[1.02] font-bold tracking-[-0.03em]"
          style={{ fontSize: "clamp(2.6rem, 6.6vw, 5.75rem)" }}
        >
          <span className="hero-anim hero-anim-d2 block">Know what needs</span>
          <span className="hero-anim hero-anim-d3 block">your reply,</span>
          <span className="hero-anim hero-anim-d4 block">
            <span className="text-gradient">today.</span>
          </span>
        </h1>

        <p className="hero-anim hero-anim-d4 mt-8 max-w-xl text-lg leading-relaxed text-white/70">
          Loopify reads your inboxes and outreach tools, tells you who to answer and follow
          up with, and drafts the reply. You review it and click Send. Nothing goes out without you.
        </p>
        <p className="hero-anim hero-anim-d5 mt-3 max-w-xl text-base leading-relaxed text-white/50">
          Connects to Gmail, Outlook, Zoho, Hostinger, Instantly and Apollo.
        </p>

        <div className="hero-anim hero-anim-d5 mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="/login"
            className="btn-gradient inline-flex h-12 items-center gap-2 rounded-full px-7 text-base font-medium text-white transition-transform hover:-translate-y-0.5"
          >
            Get started
            <ArrowRight className="size-4" />
          </Link>
          <a
            href="#how"
            className={cn(
              "inline-flex h-12 items-center rounded-full border border-white/20 bg-white/5 px-7 text-base font-medium text-white backdrop-blur-md transition-colors hover:bg-white/10",
            )}
          >
            See how it works
          </a>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-8">
        <dl className="hero-anim hero-anim-d5 grid grid-cols-2 gap-6 border-t border-white/10 pt-6 md:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label}>
              <dd className="font-display text-3xl font-bold tracking-tight md:text-4xl">
                {stat.value}
              </dd>
              <dt className="mt-1 font-mono text-[11px] tracking-[0.14em] text-white/55 uppercase">
                {stat.label}
              </dt>
            </div>
          ))}
        </dl>

        <a
          href="#how"
          className="hero-anim hero-anim-d5 mt-8 inline-flex items-center gap-3 font-mono text-[11px] tracking-[0.18em] text-white/60 uppercase transition-colors hover:text-white"
        >
          <span className="relative h-10 w-px overflow-hidden bg-white/20">
            <span className="animate-scroll-line absolute inset-0 bg-white" />
          </span>
          Scroll to explore
        </a>
      </div>

      <div className="border-t border-white/10 bg-white/[0.03] py-4">
        <div className="flex overflow-hidden" aria-label="Integrations">
          {[0, 1].map((copy) => (
            <ul
              key={copy}
              aria-hidden={copy === 1}
              className="animate-marquee flex shrink-0 items-center gap-10 pr-10 font-mono text-xs tracking-[0.18em] text-white/55 uppercase"
            >
              {INTEGRATIONS.map((name) => (
                <li key={name} className="flex items-center gap-10 whitespace-nowrap">
                  {name}
                  <span className="size-1 rounded-full bg-white/30" />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}
