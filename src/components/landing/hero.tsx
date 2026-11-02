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
    // Exactly one screen. The navbar floats over the top of the hero (it is fixed and 3.5rem tall),
    // so the content below starts under it. Spacing and type scale with the screen height.
    <section className="relative isolate flex h-svh min-h-[640px] flex-col overflow-hidden bg-ink text-white">
      {/* visual layer */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="absolute inset-y-0 right-0 w-full opacity-50 md:w-[66%] md:opacity-100">
          {visual}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink via-ink/75 to-transparent md:via-ink/50" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink to-transparent" />
        <div className="dot-grid pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -top-40 -left-32 size-[520px] rounded-full bg-brand/30 blur-[120px]" />
        <div className="pointer-events-none absolute -right-32 bottom-0 size-[480px] rounded-full bg-brand-teal/15 blur-[120px]" />
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col justify-center px-4 pt-[calc(3.5rem+1vh)] pb-[1vh]">
        <p className="hero-anim hero-anim-d1 inline-flex w-fit items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 font-mono text-[11px] tracking-[0.18em] text-white/80 uppercase backdrop-blur-md">
          <span className="animate-pulse-dot size-2 rounded-full bg-brand-teal" />
          AI inbox assistant
        </p>

        <h1
          className="mt-[clamp(0.75rem,3.5vh,2rem)] max-w-4xl font-display leading-[1.02] font-bold tracking-[-0.03em]"
          style={{ fontSize: "clamp(2rem, min(5.4vw, 6.8vh), 4.75rem)" }}
        >
          <span className="hero-anim hero-anim-d2 block">Never miss a reply</span>
          <span className="hero-anim hero-anim-d2 block">that matters.</span>
          <span className="hero-anim hero-anim-d3 block">
            <span className="text-gradient">Your leads</span>
          </span>
          <span className="hero-anim hero-anim-d4 block">
            <span className="text-gradient">are waiting.</span>
          </span>
        </h1>

        <p className="hero-anim hero-anim-d4 mt-[clamp(0.75rem,3vh,2rem)] max-w-xl text-base leading-relaxed text-white/70 md:text-lg">
          Loopify connects to Gmail, Outlook, Zoho, Hostinger, Instantly and Apollo — reads every
          thread, scores your hot leads, and drafts the follow-up. You review it and click Send.
          Nothing goes out without you.
        </p>

        <div className="hero-anim hero-anim-d5 mt-[clamp(1rem,4vh,2.5rem)] flex flex-wrap items-center gap-3">
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

        {/* The numbers sit in the hero text block as plain solid text with no background of their
            own. The label comes first in the markup (dt before dd) and is flipped below the number
            visually. */}
        <dl className="hero-anim hero-anim-d5 mt-[clamp(1rem,4.5vh,2.75rem)] grid max-w-2xl grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="flex flex-col-reverse gap-0.5">
              <dt className="font-mono text-[10px] tracking-[0.14em] text-white/55 uppercase md:text-[11px]">
                {stat.label}
              </dt>
              <dd className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mx-auto w-full max-w-6xl shrink-0 px-4 pb-[1.5vh]">
        <a
          href="#how"
          className="hero-anim hero-anim-d5 mt-4 inline-flex items-center gap-3 font-mono text-[11px] tracking-[0.18em] text-white/60 uppercase transition-colors hover:text-white [@media(max-height:820px)]:hidden"
        >
          <span className="relative h-10 w-px overflow-hidden bg-white/20">
            <span className="animate-scroll-line absolute inset-0 bg-white" />
          </span>
          Scroll to explore
        </a>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-white/[0.03] py-3">
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
