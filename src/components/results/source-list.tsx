"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import type { SourceStat } from "@/lib/results-derive";

const SEGMENTS = [
  { key: "good", label: "Corroborated or current", color: "var(--success)" },
  { key: "single", label: "Single source", color: "var(--fg-faint)" },
  { key: "review", label: "Needs review", color: "var(--misinfo)" },
  { key: "superseded", label: "Superseded", color: "var(--disinfo)" },
] as const;

const VERDICT = {
  attention: { label: "Needs attention", color: "var(--misinfo)", bg: "var(--misinfo-soft)" },
  echo: { label: "Only repeats others", color: "var(--fg-muted)", bg: "var(--bg-elevated)" },
  reliable: { label: "Holding up", color: "var(--success)", bg: "var(--success-soft)" },
} as const;

export function SourceList({ stats }: { stats: SourceStat[] }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {SEGMENTS.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
            <span className="size-2 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <ul className="overflow-hidden rounded-xl border border-line bg-subtle">
        {stats.map((s, i) => {
          const v = VERDICT[s.verdict];
          const total = s.own.length || 1;
          return (
            <motion.li
              key={s.name}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.35 }}
              className="border-b border-line last:border-b-0"
            >
              <Link href="/sources" className="group grid items-center gap-x-5 gap-y-2 px-4 py-3.5 transition-colors hover:bg-elevated md:grid-cols-[1.3fr_1.2fr_130px_24px]">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">{s.name}</p>
                  <p className="text-[12px] text-faint">
                    {s.documents.length} {s.documents.length === 1 ? "document" : "documents"} ·{" "}
                    {s.years[0] === s.years[1] ? s.years[0] : `${s.years[0]} to ${s.years[1]}`}
                  </p>
                </div>

                <div>
                  {s.own.length > 0 ? (
                    <div className="flex h-1.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${s.name} reliability record`}>
                      {SEGMENTS.map((seg, si) => {
                        const n = s.buckets[seg.key];
                        if (!n) return null;
                        return (
                          <motion.div
                            key={seg.key}
                            title={`${seg.label}: ${n}`}
                            style={{ background: seg.color }}
                            initial={{ width: 0 }}
                            animate={{ width: `${(n / total) * 100}%` }}
                            transition={{ duration: 0.8, delay: 0.2 + i * 0.05 + si * 0.05, ease: [0.16, 1, 0.3, 1] }}
                            className="border-r border-bg last:border-r-0"
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="h-1.5 rounded-full border border-dashed border-line-strong" />
                  )}
                  <p className="mt-1.5 text-[11.5px] text-faint">
                    {s.own.length} original {s.own.length === 1 ? "claim" : "claims"} · repeats {s.repeats.length}
                    {s.openFlags > 0 && <span className="text-muted"> · {s.openFlags} open {s.openFlags === 1 ? "flag" : "flags"}</span>}
                  </p>
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

      <p className="mt-3 text-[12px] text-faint">Open a source for its full reliability record, linked documents and history.</p>
    </div>
  );
}
