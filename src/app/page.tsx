import { Hero } from "@/components/landing/hero";
import { SiteHeader } from "@/components/landing/site-header";

function HeroVisualPlaceholder() {
  return (
    <div className="grid size-full place-items-center rounded-3xl border bg-card/40 text-sm text-muted-foreground">
      3D scene loads here
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero visual={<HeroVisualPlaceholder />} />
        <section id="how" className="mx-auto max-w-6xl px-4 py-24" />
        <section id="use-cases" className="mx-auto max-w-6xl px-4 py-24" />
        <section id="trust" className="mx-auto max-w-6xl px-4 py-24" />
      </main>
    </>
  );
}
