import { cn } from "@/lib/utils";

/**
 * Loopify mark (icon only): a navy loop arrow around a blue open envelope with an @ letter.
 * The ring and arrow follow the text colour, so they turn light on dark backgrounds; the
 * envelope uses the brand blue and a lighter blue in dark mode. Decorative: pair it with the
 * wordmark or give the surrounding link an accessible name.
 */
export function LogoMark({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <svg
      viewBox="34 51 600 600"
      className={cn(onDark ? "text-white" : "text-foreground", className)}
      aria-hidden
      focusable="false"
    >
      <g fill="none" stroke="currentColor">
        <path d="M334 148 A236 236 0 1 0 540 269" strokeWidth="40" />
        <path
          d="M350 82 L422 146 L350 210"
          strokeWidth="38"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={onDark ? "stroke-brand-light" : "stroke-brand dark:stroke-brand-light"}
      >
        <g strokeWidth="18">
          <path d="M190 352 V524 Q190 536 202 536 H468 Q480 536 480 524 V352" />
          <path d="M188 356 L228 322 M482 356 L442 322" />
          <path d="M190 356 L335 448 L480 356" />
          <path d="M196 528 L290 424 M474 528 L380 424" />
          <path d="M228 382 V277 Q228 266 239 266 H292 L335 251 L378 266 H431 Q442 266 442 277 V382" />
        </g>
        <g strokeWidth="12">
          <circle cx="333" cy="350" r="21" />
          <path d="M355 328 V362 C355 380 384 380 384 352 V345" />
          <path d="M363 393 A52 52 0 1 1 384 345" />
        </g>
      </g>
    </svg>
  );
}

/**
 * Mark plus the "Loopify" wordmark. Letters follow the theme; "oo" stays brand blue.
 * `onDark` forces the light version, for use over a dark background such as the hero.
 */
export function Logo({
  className,
  markClassName,
  onDark = false,
}: {
  className?: string;
  markClassName?: string;
  onDark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark onDark={onDark} className={cn("size-9 shrink-0", markClassName)} />
      <span
        className={cn(
          "font-display text-2xl leading-none font-extrabold tracking-tight",
          onDark ? "text-white" : "text-foreground",
        )}
      >
        L
        <span className={onDark ? "text-brand-light" : "text-brand dark:text-brand-light"}>oo</span>
        pify
      </span>
    </span>
  );
}
