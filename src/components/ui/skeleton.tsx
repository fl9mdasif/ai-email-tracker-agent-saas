import { cn } from "@/lib/utils";

/** A grey pulsing placeholder shown while real content loads. Hidden from screen readers. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
