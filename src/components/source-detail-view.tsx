"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { TopNav } from "@/components/top-nav";
import { Reveal } from "@/components/reveal";
import { Panel } from "@/components/panel";
import { ProgressRing } from "@/components/progress-ring";
import { AnimatedNumber } from "@/components/animated-number";
import { TypeBadge } from "@/components/type-badge";
import { ClaimStatusPill, StatusPill } from "@/components/results/status-pill";
import { RECORD_SEGMENTS, RecordBar, VERDICT } from "@/components/results/source-list";
import { docById, type SourceDetail } from "@/lib/results-derive";

const EXPLAIN: Record<(typeof RECORD_SEGMENTS)[number]["key"], string> = {
  good: "Corroborated by an independent source, or the current position",
  single: "Only this source says it, so it has not been checked yet",
  review: "A finding is waiting on a decision",
  superseded: "Was correct when written, replaced by newer information",
};

export function SourceDetailView({ detail }: { detail: SourceDetail }) {
  const { stat, activity, peakYears, repeatsFrom, related } = detail;
  const v = VERDICT[stat.verdict];
  const maxDocs = Math.max(1, ...activity.map((a) => a.documents));
  const { held, total, pct } = stat.checked;

  const tiles = [
    { label: "Documents", value: stat.documents.length },
    { label: "Original claims", value: stat.own.length },
    { label: "Claims repeated", value: stat.repeats.length },
    { label: "Open flags", value: stat.openFlags },
  ];

  return (
    <div className="relative min-h-screen">
      <div className="grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-[340px]" aria-hidden />
      <TopNav active={2} />

      <main className="relative mx-auto max-w-6xl px-5 pb-24 pt-8">
        <Link href="/sources" className="inline-flex items-center gap-1.5 text-[13px] text-muted transition hover:text-fg">
          <ArrowLeft className="size-3.5" />
          All sources
        </Link>

        <Reveal className="mt-5 flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium" style={{ background: v.bg, color: v.color }}>
              <span className="size-1.5 rounded-full" style={{ background: v.color }} />
              {v.label}
            </span>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{stat.name}</h1>
            <p className="mt-2 text-[14px] text-muted">
              {stat.documents.length} {stat.documents.length === 1 ? "document" : "documents"} ·{" "}
              {stat.years[0] === stat.years[1] ? stat.years[0] : `${stat.years[0]} to ${stat.years[1]}`}
            </p>
          </div>

          {pct === null ? (
            <div className="rounded-xl border border-dashed border-line-strong px-5 py-4 text-[13px] text-muted">
              Nothing to check yet
              <p className="mt-0.5 text-[12px] text-faint">No original claims</p>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <ProgressRing value={pct / 100} size={92} label="held up" />
              <p className="max-w-[170px] text-[12.5px] leading-snug text-muted">
                {held} of {total} checked {total === 1 ? "claim" : "claims"} have held up.
              </p>
            </div>
          )}
        </Reveal>

        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t, i) => (
            <motion.div
              key={t.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-xl border border-line bg-subtle p-4"
            >
              <p className="text-[12px] text-muted">{t.label}</p>
              <p className="mt-2 text-3xl font-semibold leading-none tracking-tight tabular-nums">
                <AnimatedNumber value={t.value} />
              </p>
            </motion.div>
          ))}
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.7fr_1fr]">
          <div className="space-y-5">
            <Panel title="Reliability record" description="How this source's original claims have fared" delay={0.15}>
              {stat.own.length === 0 ? (
                <p className="text-[13px] text-muted">
                  This source has not introduced any original claims. It only repeats claims from other sources, so there is nothing of its own to check.
                </p>
              ) : (
                <>
                  <RecordBar stat={stat} />
                  <ul className="mt-4 divide-y divide-line">
                    {RECORD_SEGMENTS.map((seg) => (
                      <li key={seg.key} className="flex items-center gap-3 py-2.5">
                        <span className="size-2 shrink-0 rounded-sm" style={{ background: seg.color }} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px]">{seg.label}</span>
                          <span className="block truncate text-[11.5px] text-faint">{EXPLAIN[seg.key]}</span>
                        </span>
                        <span className="text-[15px] font-semibold tabular-nums">{stat.buckets[seg.key]}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 rounded-lg border border-line bg-bg p-3 text-[12.5px] leading-relaxed text-muted">
                    <p className="font-medium text-fg">How &ldquo;held up&rdquo; is worked out</p>
                    {pct === null ? (
                      <p className="mt-1">None of this source&rsquo;s claims has been checked yet, so there is no figure.</p>
                    ) : (
                      <p className="mt-1 font-mono text-[12px]">
                        {stat.buckets.good} &divide; ({stat.buckets.good} held up + {stat.buckets.review} under review + {stat.buckets.superseded} superseded) = {pct}%
                      </p>
                    )}
                    <p className="mt-1 text-faint">Unchecked single-source claims count neither way.</p>
                  </div>
                </>
              )}
            </Panel>

            {stat.own.length > 0 && (
              <Panel title="Original claims" description="Claims that started with this source" delay={0.22}>
                <ul className="divide-y divide-line">
                  {stat.own.map((c, i) => {
                    const origin = docById(c.origin);
                    return (
                      <motion.li
                        key={c.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 + i * 0.06 }}
                        className="py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[13.5px] font-medium leading-snug">{c.text}</p>
                          <ClaimStatusPill status={c.status} />
                        </div>
                        <p className="mt-1 text-[12px] text-faint">
                          Started in {origin?.title} · stated in {c.citedBy.length} {c.citedBy.length === 1 ? "document" : "documents"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {c.citedBy.map((id) => (
                            <span key={id} className="rounded border border-line px-1.5 py-0.5 text-[11.5px] text-muted">
                              {docById(id)?.title}
                            </span>
                          ))}
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
              </Panel>
            )}

            {repeatsFrom.length > 0 && (
              <Panel title="Claims it repeats" description="Counted once, back at the original source" delay={0.28}>
                <ul className="divide-y divide-line">
                  {repeatsFrom.map(({ claim, origin }) => (
                    <li key={claim.id} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-[13.5px] leading-snug">{claim.text}</p>
                        <p className="mt-1 text-[12px] text-faint">
                          Originally from {origin?.title} · {origin?.source}
                        </p>
                      </div>
                      <ClaimStatusPill status={claim.status} />
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>

          <div className="space-y-5">
            <Panel title="Activity" description="Documents per year" delay={0.2}>
              <div className="flex h-28 items-end gap-2">
                {activity.map((a, i) => (
                  <div key={a.year} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-[11px] tabular-nums text-faint">{a.documents || ""}</span>
                    <div className="flex h-16 w-full items-end">
                      <motion.div
                        className="w-full rounded-sm"
                        style={{ background: peakYears.includes(a.year) ? "var(--fg)" : "var(--border-strong)", minHeight: a.documents ? 3 : 1 }}
                        initial={{ height: 0 }}
                        animate={{ height: `${(a.documents / maxDocs) * 100}%` }}
                        transition={{ duration: 0.7, delay: 0.3 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </div>
                    <span className="text-[11px] text-muted">{a.year}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[12px] text-faint">
                {peakYears.length === 0
                  ? "No documents."
                  : peakYears.length === 1
                    ? `Most active in ${peakYears[0]}.`
                    : `Equally active in ${peakYears.join(" and ")}.`}
              </p>
            </Panel>

            <Panel title="Documents" delay={0.26}>
              <ul className="divide-y divide-line">
                {stat.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                    <span className="truncate">{d.title}</span>
                    <span className="shrink-0 text-[11.5px] text-faint">{d.year}</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Related findings" delay={0.32} action={related.length ? { label: "Open results", href: "/results" } : undefined}>
              {related.length === 0 ? (
                <p className="text-[13px] text-muted">No findings involve this source.</p>
              ) : (
                <ul className="space-y-2.5">
                  {related.map((f) => (
                    <li key={f.id}>
                      <Link href="/results" className="group block rounded-lg border border-line p-3 transition-colors hover:border-line-strong hover:bg-elevated">
                        <div className="flex items-center justify-between gap-2">
                          <TypeBadge type={f.type} />
                          <StatusPill status={f.status} />
                        </div>
                        <p className="mt-2 text-[13px] leading-snug">{f.title}</p>
                        <span className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] text-faint transition-colors group-hover:text-fg">
                          View <ArrowRight className="size-3" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>

        <p className="pt-10 text-center text-[12px] text-faint">Showing sample data. Real source records appear once scanning is connected.</p>
      </main>
    </div>
  );
}
