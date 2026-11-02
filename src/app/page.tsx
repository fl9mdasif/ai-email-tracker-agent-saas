import { CtaFooter } from "@/components/landing/cta-footer";
import { Hero } from "@/components/landing/hero";
import { HeroVisual } from "@/components/landing/hero-visual";
import { HowItWorks } from "@/components/landing/how-it-works";
import { SiteHeader } from "@/components/landing/site-header";
import { Trust } from "@/components/landing/trust";
import { UseCases } from "@/components/landing/use-cases";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero visual={<HeroVisual />} />
        <HowItWorks />
        <UseCases />
        <Trust />
        <CtaFooter />
      </main>
    </>
  );
}
