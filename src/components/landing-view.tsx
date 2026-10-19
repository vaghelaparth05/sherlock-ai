"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, FileStack, LogIn, Search, ShieldCheck, UserSearch } from "lucide-react";
import { Reveal } from "@/components/reveal";

const STEPS = [
  {
    icon: FileStack,
    title: "Upload your documents",
    body: "Drop in a folder of files on one topic. No account needed yet.",
  },
  {
    icon: Search,
    title: "Sherlock investigates",
    body: "Claims are extracted, linked to their sources, and checked against each other.",
  },
  {
    icon: UserSearch,
    title: "Sign in to track review",
    body: "Create an account to see the status of your documents while Sherlock investigates.",
  },
];

export function LandingView() {
  return (
    <div className="relative min-h-screen">
      <div className="grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden />

      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5"
      >
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-md border border-line-strong bg-elevated">
            <Search className="size-3.5 text-fg" strokeWidth={2.25} />
          </span>
          <span className="text-sm font-semibold tracking-tight">Sherlock.ai</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] text-muted transition hover:text-fg"
          >
            <LogIn className="size-3.5" />
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-md border border-line-strong bg-elevated px-3 py-1.5 text-[13px] font-medium transition hover:bg-hover"
          >
            Sign up
          </Link>
        </nav>
      </motion.header>

      <main className="relative mx-auto max-w-3xl px-5 pb-28 pt-16 text-center">
        <Reveal>
          <p className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-line bg-subtle px-2.5 py-1 text-[12px] text-muted">
            <ShieldCheck className="size-3.5 text-success" />
            Originals never modified &middot; a person decides
          </p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
            An investigator for your document collections
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
            Give Sherlock.ai a pile of documents on one topic. It shows which pieces of information can be trusted,
            where each came from, and which documents are affected when something turns out to be wrong or
            out of date.
          </p>
        </Reveal>

        <Reveal delay={0.1} className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/upload"
            className="group inline-flex items-center gap-2 rounded-md bg-fg px-5 py-2.5 text-[14px] font-medium text-bg transition hover:bg-white active:scale-[0.98]"
          >
            Upload documents
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-line-strong bg-elevated px-5 py-2.5 text-[14px] font-medium transition hover:bg-hover active:scale-[0.98]"
          >
            Information manager? Log in
          </Link>
        </Reveal>

        <div className="mt-20 grid gap-4 text-left sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-xl border border-line bg-subtle p-5"
            >
              <span className="grid size-8 place-items-center rounded-md border border-line-strong bg-elevated">
                <step.icon className="size-4 text-fg" />
              </span>
              <p className="mt-3 text-[11px] font-medium text-faint">Step {i + 1}</p>
              <h3 className="mt-1 text-[14.5px] font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{step.body}</p>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
