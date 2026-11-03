import { Flame, Snowflake, Sun } from "lucide-react";
import type { LeadTemperature } from "@/modules/email-tracker/db/schema";
import { cn } from "@/lib/utils";

const LOOK: Record<LeadTemperature, { label: string; icon: typeof Flame; className: string }> = {
  hot: { label: "Hot", icon: Flame, className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300" },
  warm: { label: "Warm", icon: Sun, className: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300" },
  cold: { label: "Cold", icon: Snowflake, className: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300" },
};

/** The lead's temperature as an icon and a word, so it never depends on colour alone. */
export function TemperatureChip({ temperature, className }: { temperature: LeadTemperature; className?: string }) {
  const { label, icon: Icon, className: look } = LOOK[temperature];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", look, className)}>
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}
