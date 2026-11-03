"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { scoreOlderLeadsAction } from "./actions";

/** Scores lead replies from the last 30 days that came in before lead scoring existed. One AI call each, at most 50. */
export function ScoreOlderButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="grid justify-items-start gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await scoreOlderLeadsAction();
            setMessage(result.message);
          })
        }
      >
        {pending ? <Loader2 className="size-3.5 motion-safe:animate-spin" /> : <Sparkles className="size-3.5" />}
        {pending ? "Scoring…" : "Score older leads"}
      </Button>
      {message ? (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
