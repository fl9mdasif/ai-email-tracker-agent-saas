"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-reads the page's server data every few seconds while the AI is still working through new mail. */
export function AutoRefresh({ active, everyMs = 5000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(timer);
  }, [active, everyMs, router]);

  return null;
}
