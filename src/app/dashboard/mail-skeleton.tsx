import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder for a list of mail cards while it loads. */
export function MailSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-2" role="status" aria-busy="true">
      <span className="sr-only">Loading mail...</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} aria-hidden className="grid gap-2 rounded-xl border bg-card p-4">
          <div className="flex items-baseline justify-between gap-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-5 w-40" />
        </div>
      ))}
    </div>
  );
}
