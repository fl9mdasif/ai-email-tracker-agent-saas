"use client";

import { Loader2, Play, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cancelScanAction, scanNowAction } from "./actions";

/** Stops the running scan. Sits right beside the progress bar. */
export function CancelScanButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await cancelScanAction();
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}
      Cancel
    </Button>
  );
}

/** Starts a scan of today's mail right away (and resumes automatic scans after a Cancel). */
export function ScanNowButton({ label = "Scan now" }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const outcome = await scanNowAction();
            setError(outcome.ok ? null : outcome.message);
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
        {label}
      </Button>
      {error && (
        <p role="status" aria-live="polite" className="max-w-64 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
