import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder with the same shape as the providers strip and one account card. */
export function AccountsSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-6">
      <span className="sr-only">Loading accounts...</span>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7" aria-hidden>
        {Array.from({ length: 7 }, (_, index) => (
          <li key={index} className="flex flex-col items-center gap-2 rounded-xl border p-3">
            <Skeleton className="size-11 rounded-[22%]" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-12" />
          </li>
        ))}
      </ul>

      <Card aria-hidden>
        <CardHeader className="gap-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-l-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <Skeleton className="size-15 rounded-[22%]" />
              <div className="grid min-w-0 flex-1 basis-48 gap-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-56 max-w-full" />
                <Skeleton className="h-4 w-28" />
              </div>
              <div className="flex gap-2 max-sm:basis-full">
                <Skeleton className="h-8 w-24 rounded-lg" />
                <Skeleton className="h-8 w-24 rounded-lg" />
              </div>
            </div>
            <div className="mt-4 grid gap-3 border-t pt-3 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="grid gap-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
