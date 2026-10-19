"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import type { SourceStat } from "@/lib/results-derive";

export const RECORD_SEGMENTS = [
  { key: "good", label: "Held up", color: "var(--success)" },
  { key: "single", label: "Single source, unchecked", color: "var(--fg-faint)" },
  { key: "review", label: "Under review", color: "var(--warning)" },
  { key: "superseded", label: "Superseded", color: "var(--disinfo)" },
] as const;

export const VERDICT = {
  attention: { label: "Needs attention", color: "var(--warning)", bg: "var(--warning-soft)" },
  echo: { label: "Only repeats others", color: "var(--fg-muted)", bg: "var(--bg-elevated)" },
  reliable: { label: "Holding up", color: "var(--success)", bg: "var(--success-soft)" },
} as const;

export function RecordBar({ stat, delay = 0 }: { stat: SourceStat; delay?: number }) {
  const total = stat.own.length || 1;
  if (stat.own.length === 0) return <div className="h-1.5 rounded-full border border-dashed border-line-strong" />;
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${stat.name} reliability record`}>
      {RECORD_SEGMENTS.map((seg, si) => {
        const n = stat.buckets[seg.key];
        if (!n) return null;
        return (
          <motion.div
            key={seg.key}
            title={`${seg.label}: ${n}`}
            style={{ background: seg.color }}
            initial={{ width: 0 }}
            animate={{ width: `${(n / total) * 100}%` }}
            transition={{ duration: 0.8, delay: 0.2 + delay + si * 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="border-r border-bg last:border-r-0"
          />
        );
      })}
    </div>
  );
}

export function SourceList({ stats }: { stats: SourceStat[] }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {RECORD_SEGMENTS.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
            <span className="size-2 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <ul className="overflow-hidden rounded-xl border border-line bg-subtle">
        {stats.map((s, i) => {
          const v = VERDICT[s.verdict];
          return (
            <motion.li
              key={s.name}
              layout="position"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.35 }}
              className="border-b border-line last:border-b-0"
            >
              <Link
                href={`/sources/${s.slug}`}
                className="group grid items-center gap-x-5 gap-y-2 px-4 py-3.5 transition-colors hover:bg-elevated md:grid-cols-[1.2fr_1.2fr_100px_140px_20px]"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">{s.name}</p>
                  <p className="text-[12px] text-faint">
                    {s.documents.length} {s.documents.length === 1 ? "document" : "documents"} ·{" "}
                    {s.years[0] === s.years[1] ? s.years[0] : `${s.years[0]} to ${s.years[1]}`}
                  </p>
                </div>

                <div>
                  <RecordBar stat={s} delay={Math.min(i, 8) * 0.04} />
                  <p className="mt-1.5 text-[11.5px] text-faint">
                    {s.own.length} original {s.own.length === 1 ? "claim" : "claims"} · repeats {s.repeats.length}
                    {s.openFlags > 0 && <span className="text-muted"> · {s.openFlags} open {s.openFlags === 1 ? "flag" : "flags"}</span>}
                  </p>
                </div>

                <div className="text-[12px]">
                  {s.checked.pct === null ? (
                    <span className="text-faint">Nothing to check</span>
                  ) : (
                    <>
                      <p className="text-[15px] font-semibold leading-none tabular-nums">{s.checked.pct}%</p>
                      <p className="mt-1 text-[11px] text-faint">
                        {s.checked.held} of {s.checked.total} held up
                      </p>
                    </>
                  )}
                </div>

                <span className="inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium" style={{ background: v.bg, color: v.color }}>
                  <span className="size-1.5 rounded-full" style={{ background: v.color }} />
                  {v.label}
                </span>

                <ArrowRight className="hidden size-4 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-fg md:block" />
              </Link>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
