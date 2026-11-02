import { ArrowRight, Mail } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

const FOOTER_LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#use-cases", label: "Use cases" },
  { href: "#trust", label: "Trust and security" },
  { href: "/login", label: "Sign in" },
];

export function CtaFooter() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-20 md:pb-28">
        <Reveal>
          <div className="relative isolate overflow-hidden rounded-3xl border bg-card px-6 py-14 text-center md:px-12 md:py-20">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_80%_at_50%_0%,color-mix(in_oklch,var(--primary)_28%,transparent),transparent)]"
            />
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance md:text-5xl">
              Start your day knowing what needs you.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground text-pretty">
              Sign in with Google, connect your first inbox, and see your sorted list in minutes.
            </p>
            <Link
              href="/login"
              className={cn(buttonVariants({ size: "lg" }), "mt-8 h-12 px-8 text-base")}
            >
              Get started
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
              <Mail className="size-3.5" />
            </span>
            AI Email Tracker
          </p>
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {FOOTER_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="transition-colors hover:text-foreground">
                {link.label}
              </a>
            ))}
          </nav>
          <p>&copy; AI Email Tracker. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
}
