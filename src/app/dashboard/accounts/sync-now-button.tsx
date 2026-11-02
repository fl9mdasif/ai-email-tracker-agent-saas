"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { syncAccountNowAction } from "./actions";

/** Refresh the list a little after queuing, once the background sync has likely finished. */
const REFRESH_AFTER_MS = 8000;

export function SyncNowButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const outcome = await syncAccountNowAction(accountId);
            setResult(outcome);
            if (outcome.ok) setTimeout(() => router.refresh(), REFRESH_AFTER_MS);
          })
        }
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        Sync now
      </Button>
      <p
        role="status"
        aria-live="polite"
        className={`max-w-56 text-right text-xs ${result && !result.ok ? "text-destructive" : "text-muted-foreground"}`}
      >
        {result?.message ?? ""}
      </p>
    </div>
  );
}
