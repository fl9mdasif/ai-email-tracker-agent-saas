import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Loopify mark: a white loop arrow around a teal envelope on a blue gradient tile.
 * Drawn on a 336 x 336 grid so it scales cleanly. Decorative; pair it with the wordmark
 * or give the surrounding link an accessible name.
 */
export function LogoMark({ className }: { className?: string }) {
  const gradientId = `loopify-gradient-${useId().replace(/:/g, "")}`;

  return (
    <svg viewBox="0 0 336 336" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4a6cf7" />
          <stop offset="1" stopColor="#2b3fd0" />
        </linearGradient>
      </defs>
      <rect width="336" height="336" rx="76" fill={`url(#${gradientId})`} />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M237 126 A80 80 0 1 1 168 86" stroke="#fff" strokeWidth="26" />
        <path d="M178 56 L212 86 L178 116" stroke="#fff" strokeWidth="24" />
        <rect x="118" y="131" width="100" height="66" rx="14" stroke="#19d3c0" strokeWidth="13" />
        <path d="M128 145 L168 174 L208 145" stroke="#19d3c0" strokeWidth="12" />
      </g>
    </svg>
  );
}

/** Mark plus the "Loopify" wordmark. Letters follow the theme; "oo" stays brand blue. */
export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={cn("size-8 shrink-0", markClassName)} />
      <span className="font-display text-xl leading-none font-extrabold tracking-tight text-foreground">
        L<span className="text-brand dark:text-brand-light">oo</span>pify
      </span>
    </span>
  );
}
