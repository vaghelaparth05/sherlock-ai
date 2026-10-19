"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Clock, FilePlus2, FileText } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { ProgressRing } from "@/components/progress-ring";
import { TypeBadge, TypeIcon } from "@/components/type-badge";
import { LAST_INVESTIGATION as L, TYPE_META, type FindingType } from "@/lib/mock-dashboard";

const ORDER: FindingType[] = ["bias", "misinformation", "disinformation"];

export function ContinueCard() {
  const openTotal = ORDER.reduce((n, t) => n + L.open[t], 0);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-line-strong bg-subtle">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-0 h-64 w-[34rem] opacity-60"
        style={{ background: "radial-gradient(closest-side, rgba(0,112,243,0.16), transparent)" }}
      />

      <div className="relative grid gap-8 p-6 sm:p-7 lg:grid-cols-[1fr_1.05fr]">
        {/* Left: where you are */}
        <div className="flex flex-col">
          <p className="flex items-center gap-2 text-[12px] text-muted">
            <span className="breathe size-1.5 rounded-full bg-accent" />
            Pick up where you left off
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">{L.name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <FileText className="size-3.5" />
              {L.documents} documents · {L.sources} sources
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" />
              Last worked {L.lastWorked}
            </span>
          </p>

          <div className="mt-6 flex items-center gap-5">
            <ProgressRing value={L.reviewed / L.total} label="reviewed" />
            <div className="text-[13px] text-muted">
              <p>
                <span className="text-2xl font-semibold tracking-tight text-fg tabular-nums">
                  <AnimatedNumber value={openTotal} />
                </span>{" "}
                findings still open
              </p>
              <p className="mt-0.5">
                {L.reviewed} of {L.total} reviewed so far
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2.5">
            {ORDER.map((t, i) => {
              const m = TYPE_META[t];
              return (
                <motion.div
                  key={t}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.07, duration: 0.4 }}
                  whileHover={{ y: -2 }}
                  className="rounded-lg border border-line bg-bg p-3 transition-colors hover:border-line-strong"
                >
                  <span style={{ color: m.color }} className="inline-flex">
                    <TypeIcon type={t} className="size-4" />
                  </span>
                  <p className="mt-2 text-2xl font-semibold leading-none tabular-nums" style={{ color: m.color }}>
                    <AnimatedNumber value={L.open[t]} />
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted">{m.label}</p>
                </motion.div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <Link
              href="/review"
              className="group inline-flex items-center gap-2 rounded-md bg-fg px-4 py-2.5 text-[13.5px] font-medium text-bg transition hover:bg-white active:scale-[0.97]"
            >
              Continue reviewing
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/results"
              className="rounded-md border border-line-strong px-3.5 py-2.5 text-[13px] transition hover:bg-hover active:scale-[0.97]"
            >
              Open results
            </Link>
            <Link
              href="/import"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2.5 text-[13px] text-muted transition hover:text-fg"
            >
              <FilePlus2 className="size-3.5" />
              Add documents
            </Link>
          </div>
        </div>

        {/* Right: the very next finding */}
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-xl border border-line bg-bg p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-muted">Next up</p>
            <div className="flex items-center gap-2">
              <TypeBadge type={L.next.type} />
              <span className="text-[12px] text-muted tabular-nums">{L.next.confidence}% confidence</span>
            </div>
          </div>

          <h3 className="mt-3 text-[17px] font-medium leading-snug tracking-tight">{L.next.title}</h3>
          <p className="mt-1.5 text-[13px] text-muted">{L.next.summary}</p>

          <div className="mt-4 space-y-2">
            <Quote tone="old" label="Older" text={L.next.older.text} from={L.next.older.from} />
            <Quote tone="new" label="Newer" text={L.next.newer.text} from={L.next.newer.from} />
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[12px] text-muted">
            <span>Affects {L.next.documents} documents</span>
            <Link href="/review" className="text-fg underline-offset-4 hover:underline">
              Decide now
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Quote({ tone, label, text, from }: { tone: "old" | "new"; label: string; text: string; from: string }) {
  return (
    <div className="flex gap-3 rounded-md border border-line bg-subtle p-3">
      <span
        className="mt-0.5 h-auto w-0.5 shrink-0 rounded-full"
        style={{ background: tone === "old" ? "var(--fg-faint)" : "var(--accent)" }}
      />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
        <p className="mt-0.5 text-[13px] leading-snug">{text}</p>
        <p className="mt-1 text-[11.5px] text-faint">{from}</p>
      </div>
    </div>
  );
}
