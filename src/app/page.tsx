import type { Metadata } from "next";
import { CtaFooter } from "@/components/landing/cta-footer";
import { Hero } from "@/components/landing/hero";
import { HeroVisual } from "@/components/landing/hero-visual";
import { HowItWorks } from "@/components/landing/how-it-works";
import { SiteHeader } from "@/components/landing/site-header";
import { Trust } from "@/components/landing/trust";
import { UseCases } from "@/components/landing/use-cases";

export const metadata: Metadata = {
  title: "Loopify: know what needs your reply today",
  description:
    "An AI assistant that reads your inboxes and outreach tools, shows what needs a reply and who needs a follow-up, and drafts the message. You always click Send.",
  openGraph: {
    title: "Loopify",
    description: "Know what needs your reply today. The AI drafts, you click Send.",
    type: "website",
  },
};

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
