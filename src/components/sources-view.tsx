"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Search, SearchX, X } from "lucide-react";
import { TopNav } from "@/components/top-nav";
import { Reveal } from "@/components/reveal";
import { AnimatedNumber } from "@/components/animated-number";
import { Segmented } from "@/components/results/filter-bar";
import { SourceList } from "@/components/results/source-list";
import { sourceStats, type SourceStat } from "@/lib/results-derive";
import { useLive, useRequireUser } from "@/components/live-provider";

type Verdict = SourceStat["verdict"] | "all";
type Sort = "attention" | "held" | "documents" | "name";

export function SourcesView() {
  useRequireUser("information_manager");
  const { results } = useLive();
  const COLLECTION = results.collection;
  const all = useMemo(() => sourceStats(results.findings, results), [results]);
  const [query, setQuery] = useState("");
  const [verdict, setVerdict] = useState<Verdict>("all");
  const [sort, setSort] = useState<Sort>("attention");

  const counts = {
    total: all.length,
    attention: all.filter((s) => s.verdict === "attention").length,
    echo: all.filter((s) => s.verdict === "echo").length,
    reliable: all.filter((s) => s.verdict === "reliable").length,
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = all.filter((s) => (verdict === "all" || s.verdict === verdict) && (!q || s.name.toLowerCase().includes(q) || s.documents.some((d) => d.title.toLowerCase().includes(q))));
    if (sort === "held") return [...list].sort((a, b) => (a.checked.pct ?? 101) - (b.checked.pct ?? 101));
    if (sort === "documents") return [...list].sort((a, b) => b.documents.length - a.documents.length);
    if (sort === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list; // already ordered by attention
  }, [all, query, verdict, sort]);

  const tiles = [
    { label: "Sources", value: counts.total, color: "var(--fg)" },
    { label: "Need attention", value: counts.attention, color: "var(--warning)" },
    { label: "Only repeat others", value: counts.echo, color: "var(--fg-muted)" },
    { label: "Holding up", value: counts.reliable, color: "var(--success)" },
  ];

  return (
    <div className="relative min-h-screen">
      <div className="grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-[340px]" aria-hidden />
      <TopNav active={1} />

      <main className="relative mx-auto max-w-6xl px-5 pb-24 pt-10">
        <Reveal>
          <p className="text-[12px] text-faint">{COLLECTION.name}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Sources</h1>
          <p className="mt-2 max-w-xl text-[15px] text-muted">
            Where each claim came from, and how those claims have held up against everything else in the collection.
          </p>
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
              <p className="mt-2 text-3xl font-semibold leading-none tracking-tight tabular-nums" style={{ color: t.value ? t.color : "var(--fg-faint)" }}>
                <AnimatedNumber value={t.value} />
              </p>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-2.5">
          <label className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sources or documents"
              className="w-full rounded-md border border-line-strong bg-bg py-2 pl-9 pr-8 text-[13px] outline-none transition placeholder:text-faint focus:border-accent"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint transition hover:text-fg">
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <Segmented<Verdict>
            label="Verdict"
            value={verdict}
            onChange={setVerdict}
            options={[
              { value: "all", label: "All" },
              { value: "attention", label: "Attention" },
              { value: "echo", label: "Repeats" },
              { value: "reliable", label: "Holding up" },
            ]}
          />
          <label className="inline-flex items-center gap-2 text-[12.5px] text-muted">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="rounded-md border border-line-strong bg-bg px-2.5 py-1.5 text-[12.5px] text-fg outline-none transition focus:border-accent"
            >
              <option value="attention">Needs attention first</option>
              <option value="held">Lowest held up</option>
              <option value="documents">Most documents</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>

        <div className="mt-5">
          {shown.length === 0 ? (
            <div className="grid place-items-center rounded-xl border border-dashed border-line-strong bg-subtle px-6 py-14 text-center">
              <SearchX className="size-6 text-faint" />
              <p className="mt-3 text-[14px] font-medium">No sources match</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setVerdict("all");
                }}
                className="mt-4 rounded-md border border-line-strong px-3.5 py-2 text-[13px] transition hover:bg-hover"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <SourceList stats={shown} />
          )}
        </div>

        <p className="mt-6 max-w-2xl text-[12.5px] leading-relaxed text-faint">
          &ldquo;Held up&rdquo; counts only claims that have been checked: those that were corroborated or are current, divided by those plus any
          under review or superseded. Single-source claims have not been checked yet, so they count neither way.
        </p>
        <p className="pt-8 text-center text-[12px] text-faint">Showing sample data. Real source records appear once scanning is connected.</p>
      </main>
    </div>
  );
}
