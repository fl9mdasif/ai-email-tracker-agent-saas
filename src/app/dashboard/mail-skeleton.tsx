import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder for the "Latest mail" list on the Today page. */
export function MailSkeleton() {
  return (
    <Card className="w-full" role="status" aria-busy="true">
      <span className="sr-only">Loading mail...</span>
      <CardHeader className="gap-2" aria-hidden>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </CardHeader>
      <CardContent aria-hidden>
        <ul className="divide-y">
          {Array.from({ length: 5 }, (_, index) => (
            <li key={index} className="grid gap-1.5 py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
