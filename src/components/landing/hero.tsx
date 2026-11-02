"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
};

export function Hero({ visual }: { visual: React.ReactNode }) {
  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent)]"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
        <motion.div
          initial="hidden"
          animate="show"
          transition={{ staggerChildren: 0.12 }}
          className="flex flex-col items-start gap-6"
        >
          <motion.p
            variants={fadeUp}
            className="rounded-full border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground"
          >
            For busy owners who live in their inbox
          </motion.p>
          <motion.h1
            variants={fadeUp}
            className="text-4xl font-semibold tracking-tight text-balance md:text-6xl"
          >
            Know what needs your reply, <span className="text-primary">today.</span>
          </motion.h1>
          <motion.p variants={fadeUp} className="max-w-xl text-lg text-muted-foreground text-pretty">
            AI Email Tracker reads your inboxes and outreach tools, tells you who to answer and follow
            up with, and drafts the reply. You review it and click Send. Nothing goes out without you.
          </motion.p>
          <motion.div variants={fadeUp} className="flex flex-wrap gap-3">
            <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "h-11 px-6 text-base")}>
              Get started
              <ArrowRight className="size-4" />
            </Link>
            <a
              href="#how"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-6 text-base")}
            >
              See how it works
            </a>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative aspect-square w-full max-w-xl justify-self-center"
        >
          {visual}
        </motion.div>
      </div>
    </section>
  );
}
