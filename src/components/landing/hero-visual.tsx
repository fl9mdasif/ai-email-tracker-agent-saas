"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { HeroFallback } from "./hero-fallback";

// The 3D bundle loads only in the browser and only for the homepage.
const HeroScene = dynamic(() => import("./hero-scene"), {
  ssr: false,
  loading: () => <SceneSkeleton />,
});

type Mode = "pending" | "scene" | "static";

function SceneSkeleton() {
  return (
    <div className="grid size-full place-items-center">
      <div className="size-24 animate-pulse rounded-full bg-primary/30 blur-xl" />
    </div>
  );
}

function hasWebGl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Static fallback for reduced motion, data saver, very weak devices or no WebGL. */
function chooseMode(): Mode {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "static";
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return "static";
  if (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2) return "static";
  return hasWebGl() ? "scene" : "static";
}

const subscribeNever = () => () => {};
const getServerMode = (): Mode => "pending";

export function HeroVisual() {
  const container = useRef<HTMLDivElement>(null);
  // Server and first client render both say "pending"; the browser then picks a real mode.
  const mode = useSyncExternalStore(subscribeNever, chooseMode, getServerMode);
  const [visible, setVisible] = useState(true);

  // Stop rendering while the hero is scrolled out of view to save battery.
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.05,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={container} className="size-full">
      {mode === "pending" ? <SceneSkeleton /> : null}
      {mode === "static" ? <HeroFallback /> : null}
      {mode === "scene" ? <HeroScene active={visible} /> : null}
    </div>
  );
}
