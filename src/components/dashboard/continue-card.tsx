"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, CheckCheck, Clock, FilePlus2, FileText } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { ProgressRing } from "@/components/progress-ring";
import { TypeBadge, TypeIcon } from "@/components/type-badge";
import { timeAgo, withScan } from "@/lib/client";
import { TYPE_META } from "@/lib/meta";
import type { DashboardPayload, FindingType } from "@/lib/types";

const ORDER: FindingType[] = ["bias", "misinformation", "disinformation"];

export function ContinueCard({ last }: { last: NonNullable<DashboardPayload["last"]> }) {
  const openTotal = ORDER.reduce((n, t) => n + last.open[t], 0);
  const allDone = openTotal === 0;
  const progress = last.total ? last.reviewed / last.total : 1;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-line-strong bg-subtle">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-0 h-64 w-[34rem] opacity-60"
        style={{ background: "radial-gradient(closest-side, rgba(0,112,243,0.16), transparent)" }}
      />

      <div className="relative grid gap-8 p-6 sm:p-7 lg:grid-cols-[1fr_1.05fr]">
        <div className="flex flex-col">
          <p className="flex items-center gap-2 text-[12px] text-muted">
            <span className="breathe size-1.5 rounded-full bg-accent" />
            {allDone ? "Your most recent investigation" : "Pick up where you left off"}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">{last.name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <FileText className="size-3.5" />
              {last.documents} documents · {last.sources} sources
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" />
              Last worked {timeAgo(last.lastWorked)}
            </span>
          </p>

          <div className="mt-6 flex items-center gap-5">
            <ProgressRing value={progress} label="reviewed" />
            <div className="text-[13px] text-muted">
              <p>
                <span className="text-2xl font-semibold tracking-tight text-fg tabular-nums">
                  <AnimatedNumber value={openTotal} />
                </span>{" "}
                findings still open
              </p>
              <p className="mt-0.5">
                {last.reviewed} of {last.total} reviewed so far
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
                  <p className="mt-2 text-2xl font-semibold leading-none tabular-nums" style={{ color: last.open[t] ? m.color : "var(--fg-faint)" }}>
                    <AnimatedNumber value={last.open[t]} />
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted">{m.label}</p>
                </motion.div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <Link
              href={withScan(allDone ? "/summary" : "/review", last.scanId)}
              className="group inline-flex items-center gap-2 rounded-md bg-fg px-4 py-2.5 text-[13.5px] font-medium text-bg transition hover:bg-white active:scale-[0.97]"
            >
              {allDone ? "See the summary" : "Continue reviewing"}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link href={withScan("/results", last.scanId)} className="rounded-md border border-line-strong px-3.5 py-2.5 text-[13px] transition hover:bg-hover active:scale-[0.97]">
              Open results
            </Link>
            <Link href={`/import?collection=${last.collectionId}`} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2.5 text-[13px] text-muted transition hover:text-fg">
              <FilePlus2 className="size-3.5" />
              Add documents
            </Link>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-xl border border-line bg-bg p-5"
        >
          {last.next ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12px] text-muted">Next up</p>
                <div className="flex items-center gap-2">
                  <TypeBadge type={last.next.type} />
                  <span className="text-[12px] text-muted tabular-nums">{last.next.confidence}% confidence</span>
                </div>
              </div>

              <h3 className="mt-3 text-[17px] font-medium leading-snug tracking-tight">{last.next.title}</h3>
              <p className="mt-1.5 text-[13px] text-muted">{last.next.summary}</p>

              {last.next.evidence.length > 0 && (
                <div className="mt-4 space-y-2">
                  {last.next.evidence.map((e, i) => (
                    <Quote key={i} tone={i === 0 ? "old" : "new"} label={e.label} text={e.text} from={e.from} />
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[12px] text-muted">
                <span>
                  Involves {last.next.documents} {last.next.documents === 1 ? "document" : "documents"}
                </span>
                <Link href={withScan("/review", last.scanId)} className="text-fg underline-offset-4 hover:underline">
                  Decide now
                </Link>
              </div>
            </>
          ) : (
            <div className="grid h-full place-items-center py-8 text-center">
              <div>
                <span className="mx-auto grid size-10 place-items-center rounded-full bg-success-soft">
                  <CheckCheck className="size-5 text-success" />
                </span>
                <p className="mt-3 text-[15px] font-medium">Everything is reviewed</p>
                <p className="mt-1 text-[13px] text-muted">Add new documents to check them against what you have already decided.</p>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}

function Quote({ tone, label, text, from }: { tone: "old" | "new"; label: string; text: string; from: string }) {
  return (
    <div className="flex gap-3 rounded-md border border-line bg-subtle p-3">
      <span className="mt-0.5 h-auto w-0.5 shrink-0 rounded-full" style={{ background: tone === "old" ? "var(--fg-faint)" : "var(--accent)" }} />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
        <p className="mt-0.5 line-clamp-3 text-[13px] leading-snug">{text}</p>
        {from && <p className="mt-1 text-[11.5px] text-faint">{from}</p>}
      </div>
    </div>
  );
}
