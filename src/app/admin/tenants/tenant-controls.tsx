"use client";

import { Loader2, Pause, Play, ScanLine, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type TenantActionResult,
  changePlanAction,
  clearPauseAction,
  deleteTenantAction,
  scanNowAction,
  setAiLimitAction,
  setModuleAction,
  setStatusAction,
} from "./actions";

export type TenantControlsProps = {
  tenantId: string;
  tenantName: string;
  status: "active" | "suspended";
  planId: string | null;
  plans: Array<{ id: string; name: string }>;
  aiLimitOverride: number | null;
  planAiLimit: number | null;
  modules: Array<{ key: string; name: string; enabled: boolean }>;
  scanPaused: boolean;
  isOwnTenant: boolean;
  can: { manage: boolean; act: boolean; delete: boolean };
};

const selectClass =
  "h-8 w-full max-w-xs rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

/** Runs one action, shows what came back next to it, and re-reads the page. */
function useRun(onDone?: () => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TenantActionResult | null>(null);
  const run = (action: () => Promise<TenantActionResult>) =>
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) {
        onDone?.();
        router.refresh();
      }
    });
  return { pending, result, run };
}

function Message({ result }: { result: TenantActionResult | null }) {
  if (!result) return null;
  return (
    <p role="status" aria-live="polite" className={`text-sm ${result.ok ? "text-muted-foreground" : "text-destructive"}`}>
      {result.message}
    </p>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 border-b pb-4 last:border-b-0 last:pb-0">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function TenantControls(props: TenantControlsProps) {
  const { tenantId, tenantName, status, can } = props;
  const [plan, setPlan] = useState(props.planId ?? "");
  const [limit, setLimit] = useState(props.aiLimitOverride === null ? "" : String(props.aiLimitOverride));
  const [typed, setTyped] = useState("");
  const router = useRouter();

  const state = useRun();
  const planRun = useRun();
  const limitRun = useRun();
  const moduleRun = useRun();
  const scan = useRun();
  const del = useRun(() => router.push("/admin/tenants"));

  if (!can.manage && !can.act && !can.delete) {
    return <p className="text-sm text-muted-foreground">Your role can look at this workspace but not change it.</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">Actions</CardTitle>
        <CardDescription>Every change here is written to the audit log with your name.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {can.manage ? (
          <>
            <Row title="Access" hint={status === "suspended" ? "Suspended: the people there cannot use the app and nothing is fetched or analyzed." : "Active."}>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant={status === "suspended" ? "default" : "outline"}
                  disabled={state.pending || (props.isOwnTenant && status === "active")}
                  onClick={() => state.run(() => setStatusAction(tenantId, status === "suspended" ? "active" : "suspended"))}
                >
                  {state.pending ? <Loader2 className="size-4 animate-spin" /> : status === "suspended" ? <Play className="size-4" /> : <Pause className="size-4" />}
                  {status === "suspended" ? "Reactivate" : "Suspend"}
                </Button>
                <Message result={state.result} />
              </div>
              {props.isOwnTenant && status === "active" ? <p className="text-xs text-muted-foreground">This is your own workspace, so it cannot be suspended here.</p> : null}
            </Row>

            <Row title="Plan">
              <div className="flex flex-wrap items-end gap-2">
                <select aria-label="Plan" value={plan} onChange={(event) => setPlan(event.target.value)} className={selectClass}>
                  <option value="" disabled>
                    No plan
                  </option>
                  {props.plans.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <Button variant="outline" disabled={planRun.pending || !plan || plan === props.planId} onClick={() => planRun.run(() => changePlanAction(tenantId, plan))}>
                  {planRun.pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Change plan
                </Button>
              </div>
              <Message result={planRun.result} />
            </Row>

            <Row
              title="Daily AI limit for this workspace"
              hint={`Leave empty to use the plan's limit${props.planAiLimit !== null ? ` (${props.planAiLimit} a day)` : ""}.`}
            >
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="ai-limit" className="sr-only">
                    Daily AI limit
                  </Label>
                  <Input id="ai-limit" inputMode="numeric" value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="plan limit" className="w-40" />
                </div>
                <Button variant="outline" disabled={limitRun.pending} onClick={() => limitRun.run(() => setAiLimitAction(tenantId, limit))}>
                  {limitRun.pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Save limit
                </Button>
              </div>
              <Message result={limitRun.result} />
            </Row>

            <Row title="Modules">
              <div className="flex flex-wrap items-center gap-2">
                {props.modules.map((module) => (
                  <Button key={module.key} variant="outline" size="sm" disabled={moduleRun.pending} onClick={() => moduleRun.run(() => setModuleAction(tenantId, module.key, !module.enabled))}>
                    {module.name}: {module.enabled ? "on (switch off)" : "off (switch on)"}
                  </Button>
                ))}
              </div>
              <Message result={moduleRun.result} />
            </Row>

            <Row title="AI scan" hint="Scans the workspace's mail from today now, without waiting for the schedule.">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" disabled={scan.pending || status === "suspended"} onClick={() => scan.run(() => scanNowAction(tenantId))}>
                  {scan.pending ? <Loader2 className="size-4 animate-spin" /> : <ScanLine className="size-4" />}
                  Scan now
                </Button>
                <Message result={scan.result} />
              </div>
            </Row>
          </>
        ) : null}

        {can.act && props.scanPaused ? (
          <Row title="Scanning is paused" hint="The user pressed Cancel, so automatic scans are off for them until they press Scan now.">
            <PauseClear tenantId={tenantId} />
          </Row>
        ) : null}

        {can.delete ? (
          <Row title="Delete this workspace" hint="Removes the workspace, its accounts, all synced mail and everything the AI made of it. Gmail access is cancelled with Google. This cannot be undone.">
            {props.isOwnTenant ? (
              <p className="text-sm text-muted-foreground">This is your own workspace. Use Settings in your own dashboard to delete it.</p>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="delete-name">
                  Type <span className="font-semibold">{tenantName}</span> to confirm
                </Label>
                <Input id="delete-name" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" className="max-w-xs" />
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="destructive" disabled={del.pending || typed.trim() !== tenantName.trim()} onClick={() => del.run(() => deleteTenantAction(tenantId, typed))}>
                    {del.pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    Delete workspace
                  </Button>
                  <Message result={del.result} />
                </div>
              </div>
            )}
          </Row>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PauseClear({ tenantId }: { tenantId: string }) {
  const { pending, result, run } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" disabled={pending} onClick={() => run(() => clearPauseAction(tenantId))}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        Turn automatic scans back on
      </Button>
      <Message result={result} />
    </div>
  );
}
