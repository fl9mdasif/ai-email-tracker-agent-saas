"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { disconnectAccountAction } from "./actions";

export function DisconnectButton({ accountId, label }: { accountId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        Disconnect
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            Loopify will delete the stored password for this mailbox and stop reading it. You can
            connect it again at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault(); // keep the dialog open until the server action finishes
              startTransition(async () => {
                await disconnectAccountAction(accountId);
                setOpen(false);
              });
            }}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Disconnect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
