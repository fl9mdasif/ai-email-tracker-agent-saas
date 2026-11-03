"use client";

import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CURRENCIES, centsToInput } from "@/core/platform/plans-pure";
import { initialPlanFormState, savePlanAction } from "./actions";

export type PlanFormPlan = {
  id: string;
  key: string;
  name: string;
  priceMonthlyCents: number;
  currency: string;
  maxAccounts: number;
  dailyAiLimit: number;
  active: boolean;
};

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

/** The same form creates a plan (no `plan`) and edits one. The key is fixed once a plan exists. */
export function PlanForm({ plan }: { plan?: PlanFormPlan }) {
  const [state, formAction, pending] = useActionState(savePlanAction, initialPlanFormState);
  const id = plan?.id ?? "new";

  return (
    <form action={formAction} className="grid gap-3">
      {plan ? <input type="hidden" name="planId" value={plan.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`key-${id}`}>Key</Label>
          {/* A disabled field is not sent, so an edit also carries the key as a hidden value. */}
          <Input id={`key-${id}`} name={plan ? undefined : "key"} defaultValue={plan?.key ?? ""} disabled={Boolean(plan)} placeholder="starter" required />
          {plan ? <input type="hidden" name="key" value={plan.key} /> : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`name-${id}`}>Name</Label>
          <Input id={`name-${id}`} name="name" defaultValue={plan?.name ?? ""} placeholder="Starter" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`price-${id}`}>Price per month</Label>
          <div className="flex gap-2">
            <Input id={`price-${id}`} name="price" inputMode="decimal" defaultValue={plan ? centsToInput(plan.priceMonthlyCents) : "0.00"} required />
            <select name="currency" defaultValue={plan?.currency ?? "USD"} aria-label="Currency" className={`${selectClass} w-24`}>
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`accounts-${id}`}>Connected accounts allowed</Label>
          <Input id={`accounts-${id}`} name="maxAccounts" type="number" min={1} max={100} defaultValue={plan?.maxAccounts ?? 1} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`ai-${id}`}>AI analyses per day</Label>
          <Input id={`ai-${id}`} name="dailyAiLimit" type="number" min={0} max={100000} defaultValue={plan?.dailyAiLimit ?? 50} required />
        </div>
        <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
          <input type="checkbox" name="active" defaultChecked={plan?.active ?? true} className="size-4" />
          Available to assign
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {plan ? "Save plan" : "Create plan"}
        </Button>
        <p
          role="status"
          aria-live="polite"
          className={`flex items-center gap-1.5 text-sm ${state.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {state.status === "success" ? <CheckCircle2 className="size-4" /> : null}
          {state.status === "error" ? <CircleAlert className="size-4" /> : null}
          {state.message}
        </p>
      </div>
    </form>
  );
}
