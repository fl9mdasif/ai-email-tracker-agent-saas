import { Mail } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { PROVIDER_BRANDS, isBrandKey } from "@/modules/email-tracker/providers/brands";

export type LogoStatus = "active" | "error";

/**
 * A provider's logo on a white rounded tile (so it reads on light and dark themes), with an
 * optional status circle in the corner: green and softly pulsing when the account is active,
 * red when it needs attention. Unknown providers get a plain mail icon.
 */
export function ProviderLogo({
  brand,
  size = 48,
  status,
  className,
}: {
  brand: string | null | undefined;
  size?: number;
  status?: LogoStatus;
  className?: string;
}) {
  const known = isBrandKey(brand) ? PROVIDER_BRANDS[brand] : null;
  const dot = Math.max(12, Math.round(size * 0.3));

  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      <span
        className="grid size-full place-items-center rounded-[22%] bg-white shadow-sm ring-1 ring-black/10"
        style={{ padding: Math.round(size * 0.16) }}
      >
        {known ? (
          <Image src={known.logo} alt="" width={size} height={size} unoptimized className="size-full object-contain" />
        ) : (
          <Mail className="size-full text-slate-500" aria-hidden />
        )}
      </span>
      {status ? (
        <span
          role="img"
          aria-label={status === "active" ? "Active" : "Needs attention"}
          className={cn(
            "absolute -right-1 -bottom-1 rounded-full ring-2 ring-card",
            status === "active" ? "animate-pulse-dot bg-emerald-500" : "bg-red-500",
          )}
          style={{ width: dot, height: dot }}
        />
      ) : null}
    </span>
  );
}
