"use client";

import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { saveScanIntervalAction, initialIntervalFormState } from "./actions";

const selectClass =
  "h-8 w-full max-w-xs rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

export function IntervalForm({
  options,
  current,
}: {
  options: Array<{ minutes: number; label: string }>;
  current: number;
}) {
  const [state, formAction, pending] = useActionState(saveScanIntervalAction, initialIntervalFormState);

  return (
    <form action={formAction} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="interval">Scan every</Label>
        <select id="interval" name="interval" defaultValue={String(current)} className={selectClass}>
          {options.map((option) => (
            <option key={option.minutes} value={option.minutes}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save
        </Button>
        <p
          role="status"
          aria-live="polite"
          className={`flex items-center gap-1.5 text-sm ${state.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {state.status === "success" && <CheckCircle2 className="size-4" />}
          {state.status === "error" && <CircleAlert className="size-4" />}
          {state.message}
        </p>
      </div>
    </form>
  );
}
