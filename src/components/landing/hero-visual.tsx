"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

// The 3D bundle loads only in the browser and only for the homepage.
const HeroScene = dynamic(() => import("./hero-scene"), {
  ssr: false,
  loading: () => <SceneSkeleton />,
});

function SceneSkeleton() {
  return (
    <div className="grid size-full place-items-center">
      <div className="size-24 animate-pulse rounded-full bg-primary/30 blur-xl" />
    </div>
  );
}

export function HeroVisual() {
  const container = useRef<HTMLDivElement>(null);
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
      <HeroScene active={visible} />
    </div>
  );
}
