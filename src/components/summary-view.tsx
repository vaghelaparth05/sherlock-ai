"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Download, LoaderCircle, Printer, ShieldCheck, ShieldX } from "lucide-react";
import { TopNav } from "@/components/top-nav";
import { Reveal } from "@/components/reveal";
import { Panel } from "@/components/panel";
import { AnimatedNumber } from "@/components/animated-number";
import { ErrorBlock, NoScans, Skeleton } from "@/components/page-states";
import { RankedBars, ScanHistory, StackedRows, Donut } from "@/components/summary/charts";
import { RecordBar } from "@/components/results/source-list";
import { api, timeAgo, useFetch, useResults, useScanId, withScan } from "@/lib/client";
import { download, findingsCsv } from "@/lib/export";
import { TYPE_META } from "@/lib/meta";
import { TYPES, sourceStats, summarise } from "@/lib/results-derive";
import type { AuditEntry, AuditVerification, FindingType, ScanSummary } from "@/lib/types";

const CLAIM_COLORS = {
  good: "var(--success)",
  single: "var(--fg-faint)",
  review: "var(--misinfo)",
  superseded: "var(--disinfo)",
};

export function SummaryView() {
  const { scanId, ready } = useScanId();
  const { data, error, loading, reload } = useResults(scanId);
  const collectionId = data?.collection.id ?? null;
  const scans = useFetch<{ scans: ScanSummary[] }>(collectionId ? `/api/scans?collection=${collectionId}` : null);
  const audit = useFetch<{ entries: AuditEntry[]; verification: AuditVerification }>(collectionId ? `/api/audit?collection=${collectionId}&limit=8` : null);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<AuditVerification | null>(null);

  const summary = useMemo(() => (data ? summarise(data.findings) : null), [data]);
  const stats = useMemo(() => (data ? sourceStats(data) : []), [data]);

  const shell = (body: React.ReactNode) => (
    <div className="relative min-h-screen">
      <div className="grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-[360px]" aria-hidden />
      <TopNav active="summary" scanId={scanId} />
      <main className="relative mx-auto max-w-6xl space-y-5 px-5 pb-24 pt-10">{body}</main>
    </div>
  );

  if (!ready || (scanId && loading)) return shell(<Skeleton />);
  if (!scanId) return shell(<NoScans />);
  if (error || !data || !summary) return shell(<ErrorBlock message={error ?? "No results."} onRetry={reload} />);
  if (data.scan.status !== "complete") {
    return shell(
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-subtle px-8 py-12 text-center">
        <LoaderCircle className="mx-auto size-6 animate-spin text-muted" />
        <h2 className="mt-4 text-lg font-semibold tracking-tight">{data.scan.status === "failed" ? "This scan failed" : "This scan is still running"}</h2>
        <Link href={withScan("/scan", scanId)} className="mt-5 inline-block rounded-md bg-fg px-4 py-2 text-[13px] font-medium text-bg transition hover:bg-white">
          Open the scan
        </Link>
      </div>,
    );
  }

  const sourceCount = new Set(data.docs.map((d) => d.source)).size;
  const pct = summary.total ? Math.round((summary.resolved / summary.total) * 100) : 100;

  const typeSlices = TYPES.map((t) => ({ key: t, label: TYPE_META[t].label, value: summary.byType[t].total, color: TYPE_META[t].color }));

  const resolutionRows = TYPES.map((t) => {
    const fs = data.findings.filter((f) => f.type === t);
    return {
      key: t,
      label: TYPE_META[t].label,
      segments: [
        { value: fs.filter((f) => f.status === "confirmed").length, color: "var(--success)", label: "Confirmed" },
        { value: fs.filter((f) => f.status === "dismissed").length, color: "var(--fg-faint)", label: "Dismissed" },
        { value: fs.filter((f) => f.status === "open").length, color: "var(--misinfo)", label: "Open" },
      ],
    };
  });

  const claimBuckets = { good: 0, single: 0, review: 0, superseded: 0 };
  for (const c of data.claims) {
    if (c.status === "corroborated" || c.status === "current") claimBuckets.good++;
    else claimBuckets[c.status]++;
  }
  const claimSlices = [
    { key: "good", label: "Held up or current", value: claimBuckets.good, color: CLAIM_COLORS.good },
    { key: "single", label: "Single source", value: claimBuckets.single, color: CLAIM_COLORS.single },
    { key: "review", label: "Under review", value: claimBuckets.review, color: CLAIM_COLORS.review },
    { key: "superseded", label: "Superseded", value: claimBuckets.superseded, color: CLAIM_COLORS.superseded },
  ];

  const affected = data.docs
    .map((d) => {
      const fs = data.findings.filter((f) => f.docIds.includes(d.id));
      const byType = new Map<FindingType, number>();
      fs.forEach((f) => byType.set(f.type, (byType.get(f.type) ?? 0) + 1));
      const top = [...byType.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      return { key: d.id, label: d.title, sub: d.source, value: fs.length, color: top ? TYPE_META[top].color : "var(--fg-faint)" };
    })
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);

  async function verify() {
    setVerifying(true);
    try {
      const r = await api<{ verification: AuditVerification }>("/api/audit?limit=1");
      setVerified(r.verification);
    } finally {
      setVerifying(false);
    }
  }
  const verification = verified ?? audit.data?.verification ?? null;

  const kpis = [
    { label: "Documents", value: data.docs.length },
    { label: "Claims", value: data.claims.length },
    { label: "Sources", value: sourceCount },
    { label: "Findings", value: summary.total },
    { label: "Resolved", value: pct, suffix: "%" },
  ];

  return shell(
    <>
      <Reveal className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] text-faint">
            {data.collection.name} · scanned {timeAgo(data.scan.finishedAt)}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Summary</h1>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => download(`sherlock-findings-${data.collection.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`, findingsCsv(data))}
            className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-elevated px-3.5 py-2 text-[13px] transition hover:bg-hover active:scale-[0.97]"
          >
            <Download className="size-4" />
            Download CSV
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-elevated px-3.5 py-2 text-[13px] transition hover:bg-hover active:scale-[0.97]">
            <Printer className="size-4" />
            Print
          </button>
        </div>
      </Reveal>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k, i) => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] }} className="rounded-xl border border-line bg-subtle p-4">
            <p className="text-[12px] text-muted">{k.label}</p>
            <p className="mt-2 text-3xl font-semibold leading-none tracking-tight tabular-nums">
              <AnimatedNumber value={k.value} />
              {k.suffix && <span className="text-xl text-muted">{k.suffix}</span>}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Findings by type" description="All findings in this scan" delay={0.15}>
          <Donut slices={typeSlices} centerLabel="findings" />
        </Panel>
        <Panel title="How they were resolved" description="Confirmed, dismissed and still open, by type" delay={0.2}>
          <StackedRows
            rows={resolutionRows}
            legend={[
              { label: "Confirmed", color: "var(--success)" },
              { label: "Dismissed", color: "var(--fg-faint)" },
              { label: "Open", color: "var(--misinfo)" },
            ]}
          />
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Claims" description="Where each extracted claim stands" delay={0.25}>
          <Donut slices={claimSlices} centerLabel="claims" />
        </Panel>
        <Panel title="Most affected documents" description="Findings that involve each document" delay={0.3}>
          <RankedBars items={affected} />
        </Panel>
      </div>

      <Panel title="Source reliability" description="How each source's original claims have held up" action={{ label: "All sources", href: withScan("/sources", scanId) }} delay={0.35}>
        <ul className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
          {stats.slice(0, 8).map((s, i) => (
            <li key={s.slug}>
              <Link href={withScan(`/sources/${s.slug}`, scanId)} className="group block">
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="truncate font-medium group-hover:underline">{s.name}</span>
                  <span className="shrink-0 text-[11.5px] text-faint">
                    {s.checked.pct === null ? "nothing to check" : `${s.checked.pct}% held up (${s.checked.held}/${s.checked.total})`}
                  </span>
                </div>
                <RecordBar stat={s} delay={i * 0.05} />
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="Scan history" description="Findings per scan of this collection" delay={0.4}>
          {scans.data ? <ScanHistory scans={scans.data.scans} currentId={scanId} /> : <div className="h-36 animate-pulse rounded-lg bg-elevated" />}
        </Panel>

        <Panel title="Audit trail" description="Every upload, scan and decision, hash-chained" delay={0.45}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-bg px-3.5 py-3">
            <p className="inline-flex items-center gap-2 text-[13px]">
              {verification?.ok === false ? <ShieldX className="size-4 text-danger" /> : <ShieldCheck className="size-4 text-success" />}
              {verification
                ? verification.ok
                  ? `Chain verified: ${verification.entries} entries, none altered`
                  : `Chain broken at entry #${verification.brokenAt}`
                : "Checking…"}
            </p>
            <button type="button" onClick={verify} disabled={verifying} className="no-print inline-flex items-center gap-1.5 text-[12.5px] text-muted underline-offset-4 transition hover:text-fg hover:underline disabled:opacity-50">
              {verifying && <LoaderCircle className="size-3.5 animate-spin" />}
              Verify again
            </button>
          </div>
          <ol className="space-y-3">
            {(audit.data?.entries ?? []).map((e) => (
              <li key={e.id} className="flex gap-3 text-[12.5px]">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-line-strong" />
                <span className="min-w-0 flex-1">
                  <span className="block leading-snug">{e.detail}</span>
                  <span className="mt-0.5 block text-[11.5px] text-faint">
                    {e.actor} · {timeAgo(e.at)} · <span className="font-mono">{e.hash.slice(0, 10)}</span>
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-subtle p-5">
        <p className="text-[13.5px] text-muted">{summary.open > 0 ? `${summary.open} findings still need a decision.` : "Everything has been reviewed."}</p>
        <div className="flex gap-2">
          <Link href={`/import?collection=${data.collection.id}`} className="rounded-md border border-line-strong px-3.5 py-2 text-[13px] transition hover:bg-hover">
            Load new documents
          </Link>
          {summary.open > 0 && (
            <Link href={withScan("/review", scanId)} className="group inline-flex items-center gap-2 rounded-md bg-fg px-4 py-2 text-[13px] font-medium text-bg transition hover:bg-white active:scale-[0.97]">
              Continue review
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      </div>
    </>,
  );
}
