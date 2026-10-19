"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, CheckCheck, FileText, FilePlus2, LoaderCircle, SkipForward, Sparkles, Undo2 } from "lucide-react";
import clsx from "clsx";
import { TopNav } from "@/components/top-nav";
import { ErrorBlock, NoScans, Skeleton } from "@/components/page-states";
import { TypeBadge } from "@/components/type-badge";
import { AssistPanel } from "@/components/results/assist-panel";
import { Highlight } from "@/components/results/highlight";
import { SeverityDot } from "@/components/results/status-pill";
import { postJson, useResults, useScanId, withScan } from "@/lib/client";
import { KIND_LABEL, TYPE_META } from "@/lib/meta";
import { TYPES, docLookup, summarise, yearLabel } from "@/lib/results-derive";
import type { Finding, FindingStatus, FindingType } from "@/lib/types";

const RANK = { high: 0, medium: 1, low: 2 } as const;

export function ReviewView() {
  const { scanId, ready } = useScanId();
  const { data, error, loading, reload, setData } = useResults(scanId);
  const [filter, setFilter] = useState<FindingType | "all">("all");
  const [skipped, setSkipped] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<FindingStatus | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [undo, setUndo] = useState<{ id: string; title: string; status: FindingStatus } | null>(null);
  const [actionError, setActionError] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const findings = useMemo(() => data?.findings ?? [], [data]);
  const summary = useMemo(() => summarise(findings), [findings]);

  const queue = useMemo(() => {
    const open = findings
      .filter((f) => f.status === "open" && (filter === "all" || f.type === filter))
      .sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.confidence - a.confidence);
    // Skipped findings go to the back of the queue, in the order they were skipped.
    return [...open.filter((f) => !skipped.includes(f.id)), ...skipped.map((id) => open.find((f) => f.id === id)).filter((f): f is Finding => !!f)];
  }, [findings, filter, skipped]);

  const current = queue[0] ?? null;
  const doc = useMemo(() => docLookup(data?.docs ?? []), [data]);

  useEffect(() => {
    // Each finding starts with a clean note field.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNote("");
    setActionError("");
  }, [current?.id]);

  const decide = useCallback(
    async (status: FindingStatus) => {
      if (!current || busy) return;
      setBusy(status);
      setActionError("");
      try {
        const updated = await postJson<Finding>(`/api/findings/${current.id}`, { status, note: note.trim() || null, actor: "Reviewer" }, "PATCH");
        setDir(status === "confirmed" ? 1 : -1);
        setData((d) => (d ? { ...d, findings: d.findings.map((f) => (f.id === current.id ? { ...f, ...updated } : f)) } : d));
        setUndo({ id: current.id, title: current.title, status });
        clearTimeout(undoTimer.current);
        undoTimer.current = setTimeout(() => setUndo(null), 7000);
      } catch (e) {
        setActionError((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [current, busy, note, setData],
  );

  const skip = useCallback(() => {
    if (!current || queue.length < 2) return;
    setDir(-1);
    setSkipped((s) => [...s.filter((x) => x !== current.id), current.id]);
  }, [current, queue.length]);

  async function undoLast() {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    try {
      const updated = await postJson<Finding>(`/api/findings/${u.id}`, { status: "open", actor: "Reviewer" }, "PATCH");
      setSkipped((s) => s.filter((x) => x !== u.id));
      setDir(-1);
      setData((d) => (d ? { ...d, findings: d.findings.map((f) => (f.id === u.id ? { ...f, ...updated } : f)) } : d));
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "SELECT" || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "c") void decide("confirmed");
      else if (k === "d") void decide("dismissed");
      else if (k === "s") skip();
      else if (k === "n") {
        e.preventDefault();
        noteRef.current?.focus();
      } else if (k === "u") void undoLast();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const shell = (body: React.ReactNode) => (
    <div className="relative min-h-screen">
      <div className="grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-[340px]" aria-hidden />
      <TopNav active="review" scanId={scanId} />
      <main className="relative mx-auto max-w-6xl px-5 pb-24 pt-10">{body}</main>
    </div>
  );

  if (!ready || (scanId && loading)) return shell(<Skeleton rows={1} />);
  if (!scanId) return shell(<NoScans />);
  if (error || !data) return shell(<ErrorBlock message={error ?? "No results."} onRetry={reload} />);
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

  const reviewed = summary.resolved;
  const pct = summary.total ? (reviewed / summary.total) * 100 : 100;
  const counts: Record<FindingType | "all", number> = {
    all: summary.open,
    misinformation: summary.byType.misinformation.open,
    bias: summary.byType.bias.open,
    disinformation: summary.byType.disinformation.open,
  };

  return shell(
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] text-faint">{data.collection.name}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Review</h1>
        </div>
        <div className="w-full max-w-xs">
          <div className="flex items-baseline justify-between text-[12px] text-muted">
            <span>
              {reviewed} of {summary.total} reviewed
            </span>
            <span className="tabular-nums">{Math.round(pct)}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <motion.div className="h-full rounded-full bg-fg" animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 110, damping: 22 }} />
          </div>
        </div>
      </div>

      <div role="tablist" className="no-scrollbar mt-6 flex gap-1 overflow-x-auto border-b border-line">
        {(["all", ...TYPES] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={filter === t}
            onClick={() => setFilter(t)}
            className={clsx("relative flex shrink-0 items-center gap-2 px-3.5 py-2.5 text-[13.5px] transition-colors", filter === t ? "text-fg" : "text-muted hover:text-fg")}
          >
            {t === "all" ? "All open" : TYPE_META[t].label}
            <span className="rounded-full bg-elevated px-1.5 py-px text-[11px] tabular-nums text-muted">{counts[t]}</span>
            {filter === t && <motion.span layoutId="review-tab" className="absolute inset-x-0 -bottom-px h-px bg-fg" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          </button>
        ))}
      </div>

      {current ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <AnimatePresence mode="wait" custom={dir}>
              <motion.article
                key={current.id}
                custom={dir}
                initial={{ opacity: 0, x: 40 * dir, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -60 * dir, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 360, damping: 34 }}
                className="rounded-2xl border border-line-strong bg-subtle p-6"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <TypeBadge type={current.type} />
                  <span className="rounded border border-line px-1.5 py-0.5 text-[11.5px] text-muted">{KIND_LABEL[current.kind]}</span>
                  <SeverityDot severity={current.severity} />
                  <span className="text-[12px] text-faint">· {current.confidence}% confidence</span>
                  {current.isNew && findings.some((f) => !f.isNew) && <span className="rounded-full bg-accent-soft px-1.5 py-px text-[10.5px] font-medium text-accent">New</span>}
                </div>
                <h2 className="mt-4 text-xl font-semibold leading-snug tracking-tight">{current.title}</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{current.summary}</p>

                {current.aiReview && (
                  <p className="mt-4 flex gap-2 rounded-lg border border-line bg-bg p-3 text-[12.5px] leading-relaxed text-muted" style={{ borderColor: current.aiReview.verdict === "disagree" ? "var(--warning)" : undefined }}>
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" />
                    <span>
                      <span className="text-fg">AI second opinion: {current.aiReview.verdict}. </span>
                      {current.aiReview.rationale}
                    </span>
                  </p>
                )}

                {current.evidence.length > 0 && (
                  <div className={clsx("mt-5 grid gap-2.5", current.evidence.length > 1 && "sm:grid-cols-2")}>
                    {current.evidence.map((e, i) => {
                      const d = e.docId ? doc(e.docId) : undefined;
                      return (
                        <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.07 }} className="rounded-lg border border-line bg-bg p-3.5">
                          <p className="text-[11px] uppercase tracking-wide text-faint">{e.label}</p>
                          <p className={e.mono ? "mt-1.5 break-all font-mono text-[12.5px]" : "mt-1.5 text-[13.5px] leading-snug"}>
                            <Highlight text={e.quote} />
                          </p>
                          {d && (
                            <p className="mt-2 text-[11.5px] text-faint">
                              {d.title} · {yearLabel(d.year)}
                            </p>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-1.5">
                  {current.docIds.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[11.5px] text-muted">
                      <FileText className="size-3" />
                      {doc(id)?.title ?? "Document"}
                    </span>
                  ))}
                </div>

                <div className="mt-5">
                  <AssistPanel findingId={current.id} onUseNote={setNote} />
                </div>

                <label htmlFor="review-note" className="mb-1.5 mt-5 block text-[12px] text-muted">
                  Note for the audit log <span className="text-faint">(press N)</span>
                </label>
                <textarea
                  id="review-note"
                  ref={noteRef}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={600}
                  placeholder="Optional. Why you decided this."
                  className="w-full resize-none rounded-md border border-line-strong bg-bg px-3 py-2 text-[13px] outline-none transition placeholder:text-faint focus:border-accent"
                />

                {actionError && <p className="mt-3 rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{actionError}</p>}

                <div className="mt-5 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => decide("confirmed")}
                    disabled={!!busy}
                    className="inline-flex items-center gap-2 rounded-md bg-fg px-5 py-2.5 text-[13.5px] font-medium text-bg transition hover:bg-white active:scale-[0.97] disabled:opacity-60"
                  >
                    {busy === "confirmed" ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
                    Confirm
                    <kbd className="ml-1 rounded bg-black/10 px-1.5 text-[10.5px]">C</kbd>
                  </button>
                  <button
                    type="button"
                    onClick={() => decide("dismissed")}
                    disabled={!!busy}
                    className="inline-flex items-center gap-2 rounded-md border border-line-strong px-5 py-2.5 text-[13.5px] transition hover:bg-hover active:scale-[0.97] disabled:opacity-60"
                  >
                    Dismiss
                    <kbd className="ml-1 rounded bg-elevated px-1.5 text-[10.5px] text-muted">D</kbd>
                  </button>
                  <button
                    type="button"
                    onClick={skip}
                    disabled={queue.length < 2}
                    className="inline-flex items-center gap-2 rounded-md px-3 py-2.5 text-[13px] text-muted transition hover:text-fg disabled:opacity-40"
                  >
                    <SkipForward className="size-4" />
                    Skip for now
                    <kbd className="ml-1 rounded bg-elevated px-1.5 text-[10.5px]">S</kbd>
                  </button>
                </div>
              </motion.article>
            </AnimatePresence>
          </div>

          <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
            <h3 className="text-[12px] font-medium uppercase tracking-wide text-faint">Up next ({queue.length - 1})</h3>
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {queue.slice(1, 7).map((f) => (
                  <motion.li key={f.id} layout initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="rounded-lg border border-line bg-subtle p-3">
                    <div className="flex items-center justify-between gap-2">
                      <TypeBadge type={f.type} />
                      <SeverityDot severity={f.severity} withLabel={false} />
                    </div>
                    <p className="mt-2 line-clamp-2 text-[12.5px] leading-snug">{f.title}</p>
                  </motion.li>
                ))}
              </AnimatePresence>
              {queue.length > 7 && <li className="px-1 text-[12px] text-faint">and {queue.length - 7} more</li>}
              {queue.length === 1 && <li className="px-1 text-[12px] text-faint">This is the last one.</li>}
            </ul>
          </aside>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto mt-12 max-w-lg rounded-2xl border border-line-strong bg-subtle p-8 text-center">
          <motion.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 16 }} className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft">
            <CheckCheck className="size-6 text-success" />
          </motion.span>
          <h2 className="mt-4 text-xl font-semibold tracking-tight">{summary.open === 0 ? "Everything is reviewed" : "Nothing left in this view"}</h2>
          <p className="mt-1.5 text-[13.5px] text-muted">
            {summary.confirmed} confirmed, {summary.dismissed} dismissed. Each decision is in the audit log.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href={withScan("/summary", scanId)} className="group inline-flex items-center gap-2 rounded-md bg-fg px-4 py-2.5 text-[13px] font-medium text-bg transition hover:bg-white active:scale-[0.97]">
              See the summary
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link href={`/import?collection=${data.collection.id}`} className="inline-flex items-center gap-2 rounded-md border border-line-strong px-4 py-2.5 text-[13px] transition hover:bg-hover active:scale-[0.97]">
              <FilePlus2 className="size-4" />
              Load new documents
            </Link>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {undo && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-lg border border-line-strong bg-elevated px-4 py-3 text-[13px] shadow-xl"
          >
            <span className="max-w-[320px] truncate text-muted">
              {undo.status === "confirmed" ? "Confirmed" : "Dismissed"}: {undo.title}
            </span>
            <button type="button" onClick={undoLast} className="inline-flex items-center gap-1.5 text-fg underline-offset-4 hover:underline">
              <Undo2 className="size-3.5" />
              Undo <kbd className="rounded bg-bg px-1.5 text-[10.5px] text-muted">U</kbd>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
  );
}
