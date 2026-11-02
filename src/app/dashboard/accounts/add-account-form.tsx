"use client";

import { CheckCircle2, CircleAlert, Loader2, X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { accountFormAction } from "./actions";
import { initialAccountFormState } from "./form-state";

export type PresetOption = { key: string; label: string };

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30";

export function AddAccountForm({
  presets,
  onClose,
  onSaved,
}: {
  presets: PresetOption[];
  /** Called when the user closes the form without saving. */
  onClose?: () => void;
  /** Called once the account has been saved. */
  onSaved?: () => void;
}) {
  const [state, formAction, pending] = useActionState(accountFormAction, initialAccountFormState);

  // Close the form by itself once the account is saved; the new card appears in the list.
  useEffect(() => {
    if (state.saved) onSaved?.();
  }, [state.saved, onSaved]);

  // Non-secret fields are controlled so a failed attempt keeps what was typed; the password
  // is not, so it is cleared after every submit.
  const [preset, setPreset] = useState(presets[0]?.key ?? "");
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");

  return (
    <Card>
      <CardHeader>
        {onClose ? (
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Close the form"
              title="Close"
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </CardAction>
        ) : null}
        <CardTitle className="font-display text-lg">Add a new account</CardTitle>
        <CardDescription>
          Hostinger and Zoho mailboxes connect over IMAP. Your password is encrypted before it is
          saved and is never shown again.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 md:max-w-xl">
          <div className="grid gap-1.5">
            <Label htmlFor="preset">Mail provider</Label>
            <select
              id="preset"
              name="preset"
              value={preset}
              onChange={(event) => setPreset(event.target.value)}
              aria-invalid={Boolean(state.fieldErrors.preset)}
              className={selectClass}
            >
              {presets.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors.preset} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="off"
              placeholder="you@yourcompany.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(state.fieldErrors.email)}
              required
            />
            <FieldError message={state.fieldErrors.email} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="password">App password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(state.fieldErrors.password)}
              required
            />
            <FieldError message={state.fieldErrors.password} />
            <p className="text-xs text-muted-foreground">
              Hostinger: use the mailbox password. Zoho: turn on IMAP access in Mail settings and
              create an app password in your account&apos;s Security settings.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="label">Name (optional)</Label>
            <Input
              id="label"
              name="label"
              maxLength={60}
              placeholder="Sales inbox"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              aria-invalid={Boolean(state.fieldErrors.label)}
            />
            <FieldError message={state.fieldErrors.label} />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" name="intent" value="test" variant="outline" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Test connection
            </Button>
            <Button type="submit" name="intent" value="save" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save account
            </Button>
            {onClose ? (
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
            ) : null}
          </div>

          <div role="status" aria-live="polite" className="min-h-6 text-sm">
            {pending ? (
              <p className="text-muted-foreground">Checking the mailbox, this can take a few seconds...</p>
            ) : state.message ? (
              <p
                className={cn(
                  "flex items-start gap-2",
                  state.status === "success" ? "text-brand-teal-text dark:text-brand-teal" : "text-destructive",
                )}
              >
                {state.status === "success" ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                )}
                {state.message}
              </p>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}
