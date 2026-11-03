"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteWorkspaceAction } from "./actions";

/** "Delete my workspace": the button stays off until the workspace name is typed exactly. */
export function DeleteWorkspace({ workspaceName }: { workspaceName: string }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matches = typed.trim() === workspaceName.trim();

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="confirm-name">
          Type <span className="font-semibold">{workspaceName}</span> to confirm
        </Label>
        <Input id="confirm-name" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" className="max-w-xs" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="destructive"
          disabled={!matches || pending}
          onClick={() =>
            startTransition(async () => {
              // On success this signs out and leaves the page; it only returns when something went wrong.
              const outcome = await deleteWorkspaceAction(typed);
              setError(outcome.message);
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          Delete my workspace
        </Button>
        {error ? (
          <p role="status" aria-live="polite" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
