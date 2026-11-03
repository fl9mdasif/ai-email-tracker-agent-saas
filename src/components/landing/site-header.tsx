"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { signOutAction } from "@/app/sign-out-action";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#use-cases", label: "Use cases" },
  { href: "#trust", label: "Trust" },
];

/** Scrolled far enough that the bar should get its own background. */
const SCROLL_THRESHOLD = 24;

function subscribeToScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}
const isScrolled = () => window.scrollY > SCROLL_THRESHOLD;
const isScrolledOnServer = () => false;

/**
 * Floats over the top of the page. At the very top it is fully transparent with light text,
 * because the hero behind it is always dark. Once the page scrolls it becomes a light,
 * blurred bar that follows the site theme.
 */
export function SiteHeader({ signedIn = false }: { signedIn?: boolean }) {
  const scrolled = useSyncExternalStore(subscribeToScroll, isScrolled, isScrolledOnServer);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled
          ? "border-border/60 bg-background/70 backdrop-blur-xl"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" aria-label="Loopify home">
          <Logo onDark={!scrolled} />
        </Link>
        <nav
          aria-label="Sections"
          className={cn(
            "hidden items-center gap-6 text-sm transition-colors md:flex",
            scrolled ? "text-muted-foreground" : "text-white/75",
          )}
        >
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={cn("transition-colors", scrolled ? "hover:text-foreground" : "hover:text-white")}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle className={cn(!scrolled && "text-white hover:bg-white/10 hover:text-white")} />
          {signedIn ? (
            <>
              <Link
                href="/dashboard"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "lg" }),
                  !scrolled && "text-white hover:bg-white/10 hover:text-white",
                )}
              >
                Dashboard
              </Link>
              <form action={signOutAction}>
                <button type="submit" className={cn(buttonVariants({ size: "lg" }))}>
                  Log out
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className={cn(buttonVariants({ size: "lg" }))}>
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
