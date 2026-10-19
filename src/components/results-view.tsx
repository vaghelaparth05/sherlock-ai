"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, CircleCheck, FilePlus2, SearchX } from "lucide-react";
import clsx from "clsx";
import { TopNav } from "@/components/top-nav";
import { Reveal } from "@/components/reveal";
import { AnimatedNumber } from "@/components/animated-number";
import { TypeIcon } from "@/components/type-badge";
import { FilterBar } from "@/components/results/filter-bar";
import { FindingCard } from "@/components/results/finding-card";
import { FindingDrawer } from "@/components/results/finding-drawer";
import { SourceList } from "@/components/results/source-list";
import { TYPE_META } from "@/lib/mock-dashboard";
import { COLLECTION, DOCS, FINDINGS, type FindingStatus, type FindingType } from "@/lib/results-data";
import { TYPES, applyFilters, sourceStats, summarise, type Filters } from "@/lib/results-derive";

const DEFAULT_FILTERS: Filters = { type: "all", severity: "all", status: "open", query: "", sort: "severity" };

export function ResultsView() {
  const [findings, setFindings] = useState(FINDINGS);
  const [view, setView] = useState<"findings" | "sources">("findings");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const summary = useMemo(() => summarise(findings), [findings]);
  const visible = useMemo(() => applyFilters(findings, filters), [findings, filters]);
  const stats = useMemo(() => sourceStats(findings), [findings]);
  const selected = findings.find((f) => f.id === selectedId) ?? null;

  const sourceCount = new Set(DOCS.map((d) => d.source)).size;

  const decide = useCallback((id: string, status: FindingStatus) => {
    setFindings((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
    if (status !== "open") setSelectedId(null);
  }, []);

  const tab = view === "sources" ? "sources" : filters.type;
  const tabs: { id: "all" | FindingType | "sources"; label: string; count: number }[] = [
    { id: "all", label: "All findings", count: summary.total },
    ...TYPES.map((t) => ({ id: t, label: TYPE_META[t].label, count: summary.byType[t].total })),
    { id: "sources", label: "Sources", count: sourceCount },
  ];

  const filtersActive = filters.type !== "all" || filters.severity !== "all" || filters.query !== "" || filters.status !== "open";

  return (
    <div className="relative min-h-screen">
      <div className="grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-[360px]" aria-hidden />
      <TopNav active={2} />

      <main className="relative mx-auto max-w-6xl px-5 pb-24 pt-10">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-subtle px-2.5 py-1 text-[12px] text-muted">
              <CircleCheck className="size-3.5 text-success" />
              {COLLECTION.scannedAt}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{COLLECTION.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/import"
              className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-elevated px-3.5 py-2 text-[13px] transition hover:bg-hover active:scale-[0.97]"
            >
              <FilePlus2 className="size-4" />
              Load new documents
            </Link>
            <Link
              href="/review"
              className="group inline-flex items-center gap-2 rounded-md bg-fg px-4 py-2 text-[13px] font-medium text-bg transition hover:bg-white active:scale-[0.97]"
            >
              Start review
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </Reveal>

        {/* Type tiles */}
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {TYPES.map((t, i) => {
            const m = TYPE_META[t];
            const s = summary.byType[t];
            const done = s.total - s.open;
            const on = view === "findings" && filters.type === t;
            return (
              <motion.button
                key={t}
                type="button"
                onClick={() => {
                  setView("findings");
                  setFilters((f) => ({ ...f, type: on ? "all" : t }));
                }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ y: -2 }}
                aria-pressed={on}
                className={clsx(
                  "rounded-xl border bg-subtle p-4 text-left transition-colors",
                  on ? "border-fg" : "border-line hover:border-line-strong",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-[13px] font-medium">
                    <span className="grid size-7 place-items-center rounded-md" style={{ background: m.soft, color: m.color }}>
                      <TypeIcon type={t} className="size-3.5" />
                    </span>
                    {m.label}
                  </span>
                  <span className="text-[11.5px] text-faint">{s.total} total</span>
                </div>
                <p className="mt-4 text-4xl font-semibold leading-none tracking-tight tabular-nums" style={{ color: s.open ? m.color : "var(--fg-faint)" }}>
                  <AnimatedNumber value={s.open} />
                  <span className="ml-1.5 text-[13px] font-normal text-muted">open</span>
                </p>
                <div className="mt-4 h-1 overflow-hidden rounded-full bg-line">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: m.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${s.total ? (done / s.total) * 100 : 0}%` }}
                    transition={{ duration: 0.9, delay: 0.3 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                <p className="mt-1.5 text-[11.5px] text-faint">
                  {done} of {s.total} resolved
                </p>
              </motion.button>
            );
          })}
        </div>

        <div className="mt-8">
          <section className="min-w-0">
            <div role="tablist" className="no-scrollbar mb-4 flex gap-1 overflow-x-auto border-b border-line">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => {
                    if (t.id === "sources") setView("sources");
                    else {
                      setView("findings");
                      setFilters((f) => ({ ...f, type: t.id as Filters["type"] }));
                    }
                  }}
                  className={clsx(
                    "relative flex shrink-0 items-center gap-2 px-3.5 py-2.5 text-[13.5px] transition-colors",
                    tab === t.id ? "text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {t.label}
                  <span className="rounded-full bg-elevated px-1.5 py-px text-[11px] tabular-nums text-muted">{t.count}</span>
                  {tab === t.id && (
                    <motion.span
                      layoutId="results-tab"
                      className="absolute inset-x-0 -bottom-px h-px bg-fg"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {view === "sources" ? (
                <motion.div key="sources" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                  <SourceList stats={stats} />
                </motion.div>
              ) : (
                <motion.div key="findings" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                  <FilterBar filters={filters} onChange={setFilters} />
                  <p className="mb-3 mt-4 text-[12.5px] text-faint" aria-live="polite">
                    {visible.length} {visible.length === 1 ? "finding" : "findings"}
                    {filtersActive && (
                      <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className="ml-3 text-muted underline-offset-4 hover:text-fg hover:underline">
                        Reset filters
                      </button>
                    )}
                  </p>

                  {visible.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="grid place-items-center rounded-xl border border-dashed border-line-strong bg-subtle px-6 py-14 text-center"
                    >
                      <SearchX className="size-6 text-faint" />
                      <p className="mt-3 text-[14px] font-medium">No findings match</p>
                      <p className="mt-1 max-w-xs text-[12.5px] text-muted">
                        {summary.open === 0 && filters.status === "open"
                          ? "Everything has been reviewed. Switch to Resolved to see past decisions."
                          : "Try widening the filters or clearing the search."}
                      </p>
                      <button
                        type="button"
                        onClick={() => setFilters({ ...DEFAULT_FILTERS, status: "all" })}
                        className="mt-4 rounded-md border border-line-strong px-3.5 py-2 text-[13px] transition hover:bg-hover"
                      >
                        Show everything
                      </button>
                    </motion.div>
                  ) : (
                    <ul className="space-y-2.5">
                      <AnimatePresence mode="popLayout" initial={false}>
                        {visible.map((f) => (
                          <FindingCard key={f.id} finding={f} onOpen={setSelectedId} />
                        ))}
                      </AnimatePresence>
                    </ul>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </section>

        </div>

        <p className="pt-10 text-center text-[12px] text-faint">Showing sample data. Real findings appear once scanning is connected.</p>
      </main>

      <FindingDrawer finding={selected} onClose={() => setSelectedId(null)} onDecide={decide} />
    </div>
  );
}
