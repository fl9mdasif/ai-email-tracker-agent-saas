import { Hero } from "@/components/landing/hero";
import { HeroVisual } from "@/components/landing/hero-visual";
import { HowItWorks } from "@/components/landing/how-it-works";
import { SiteHeader } from "@/components/landing/site-header";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero visual={<HeroVisual />} />
        <HowItWorks />
        <section id="use-cases" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24" />
        <section id="trust" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24" />
      </main>
    </>
  );
}
