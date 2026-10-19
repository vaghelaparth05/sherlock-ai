"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, CircleAlert, FileText, LoaderCircle, Sparkles } from "lucide-react";
import clsx from "clsx";
import { TopNav } from "@/components/top-nav";
import { AnimatedNumber } from "@/components/animated-number";
import { ErrorBlock } from "@/components/page-states";
import { api, postJson, readParam, withScan } from "@/lib/client";
import type { ScanDocState, ScanEvent, ScanInfo } from "@/lib/types";

interface Poll {
  scan: ScanInfo;
  documents: ScanDocState[];
  events: ScanEvent[];
}

const STAGES = [
  { key: "Reading documents", label: "Reading documents", hint: "Extracting claims, dates and sources" },
  { key: "Tracing sources", label: "Tracing sources", hint: "Finding each claim's earliest source" },
  { key: "Comparing claims", label: "Comparing claims", hint: "Spotting what supersedes or contradicts what" },
  { key: "Checking integrity", label: "Checking integrity", hint: "Fingerprints and authority citations" },
  { key: "Reviewing findings", label: "Second opinion", hint: "AI reviews each finding", aiOnly: true },
  { key: "Writing results", label: "Writing results", hint: "Saving findings and the audit trail" },
];

export function ScanView() {
  const router = useRouter();
  const [scanId, setScanId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const last = useRef(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    // The scan id lives in the URL, which is only readable on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScanId(readParam("scan"));
    setReady(true);
  }, []);

  /* poll while the scan runs */
  const status = poll?.scan.status;
  useEffect(() => {
    if (!scanId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const p = await api<Poll>(`/api/scans/${scanId}?after=${last.current}`);
        if (stop) return;
        setPoll((prev) => ({ ...p, events: prev?.events ?? [] }));
        if (p.events.length) {
          last.current = p.events[p.events.length - 1].id;
          setEvents((e) => [...e, ...p.events]);
        }
        setError(null);
        if (p.scan.status === "queued" || p.scan.status === "running") timer = setTimeout(tick, 700);
      } catch (e) {
        if (stop) return;
        setError((e as Error).message);
        timer = setTimeout(tick, 2500);
      }
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [scanId]);

  /* clock for the elapsed timer */
  useEffect(() => {
    if (status !== "running" && status !== "queued") return;
    // Started after mount: reading the clock during render is not allowed under Cache Components.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [status]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [events.length]);

  /* move on to the results shortly after a successful scan */
  useEffect(() => {
    if (status !== "complete" || !scanId) return;
    const t = setTimeout(() => {
      setRedirecting(true);
      router.push(withScan("/results", scanId));
    }, 3200);
    return () => clearTimeout(t);
  }, [status, scanId, router]);

  const scan = poll?.scan;
  const docs = useMemo(() => poll?.documents ?? [], [poll]);
  const read = docs.filter((d) => d.status === "done" || d.status === "error").length;
  const claims = docs.reduce((n, d) => n + d.claims, 0);
  const sources = new Set(docs.filter((d) => d.status === "done" && d.source).map((d) => d.source)).size;
  const finished = scan?.finishedAt ? new Date(scan.finishedAt).getTime() : now;
  const elapsed = scan && finished ? Math.max(0, Math.round((finished - new Date(scan.startedAt).getTime()) / 1000)) : 0;
  const activeStage = scan?.status === "complete" ? STAGES.length : Math.max(0, STAGES.findIndex((s) => s.key === scan?.stage));
  const aiMode = scan?.provider === "gemini";
  const stages = STAGES.filter((s) => !s.aiOnly || aiMode);
  const pct = Math.round((scan?.progress ?? 0) * 100);

  const shell = (body: React.ReactNode) => (
    <div className="relative min-h-screen">
      <div className="grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-[360px]" aria-hidden />
      <TopNav active="scan" scanId={scanId} />
      <main className="relative mx-auto max-w-6xl px-5 pb-24 pt-10">{body}</main>
    </div>
  );

  if (ready && !scanId) {
    return shell(
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-line-strong bg-subtle px-8 py-12 text-center">
        <h2 className="text-lg font-semibold tracking-tight">No scan to show</h2>
        <p className="mt-1.5 text-[13.5px] text-muted">Start a scan from the import page.</p>
        <Link href="/import" className="mt-5 inline-block rounded-md bg-fg px-4 py-2 text-[13px] font-medium text-bg transition hover:bg-white">
          Import documents
        </Link>
      </div>,
    );
  }
  if (!scan) return shell(error ? <ErrorBlock message={error} /> : <div className="h-64 animate-pulse rounded-2xl bg-subtle" />);

  const failed = scan.status === "failed";
  const complete = scan.status === "complete";

  async function retry() {
    if (!scan) return;
    try {
      const r = await postJson<{ id: string }>("/api/scans", { collectionId: scan.collectionId });
      router.push(`/scan?scan=${r.id}`);
      setPoll(null);
      setEvents([]);
      last.current = 0;
      setScanId(r.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return shell(
    <>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-subtle px-2.5 py-1 text-[12px] text-muted">
            {failed ? <CircleAlert className="size-3.5 text-danger" /> : complete ? <Check className="size-3.5 text-success" /> : <span className="breathe size-1.5 rounded-full bg-accent" />}
            {failed ? "Scan failed" : complete ? "Scan complete" : "Scanning"}
            <span className="text-faint">·</span>
            <Sparkles className="size-3" />
            {aiMode ? `Gemini${scan.model ? ` · ${scan.model}` : ""}` : scan.provider === "external" ? "External scanner" : "Offline rules scanner"}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{scan.collectionName}</h1>
          <p className="mt-2 text-[14px] text-muted">
            {failed ? "The scan stopped before it finished." : complete ? "Taking you to the results." : scan.stage}
            {!failed && !complete && <span className="text-faint"> · {elapsed}s</span>}
          </p>
        </div>

        <div className="w-full max-w-xs">
          <div className="flex items-baseline justify-between text-[12px] text-muted">
            <span>Progress</span>
            <span className="text-2xl font-semibold tabular-nums text-fg">
              <AnimatedNumber value={complete ? 100 : pct} />%
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <motion.div
              className="relative h-full overflow-hidden rounded-full"
              style={{ background: failed ? "var(--danger)" : complete ? "var(--success)" : "var(--accent)" }}
              animate={{ width: `${complete ? 100 : pct}%` }}
              transition={{ type: "spring", stiffness: 90, damping: 22 }}
            >
              {!complete && !failed && <span className="sweep absolute inset-0" />}
            </motion.div>
          </div>
        </div>
      </motion.div>

      {failed && (
        <div className="mt-6">
          <ErrorBlock message={scan.error ?? "Unknown error."} onRetry={retry} />
        </div>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Documents read", value: read, of: scan.docCount },
          { label: "Statements found", value: claims },
          { label: "Sources seen", value: sources },
          { label: "Findings raised", value: complete ? scan.findingCount : 0, dim: !complete },
        ].map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06 }} className="rounded-xl border border-line bg-subtle p-4">
            <p className="text-[12px] text-muted">{c.label}</p>
            <p className={clsx("mt-2 text-3xl font-semibold leading-none tracking-tight tabular-nums", c.dim && "text-faint")}>
              <AnimatedNumber value={c.value} />
              {c.of !== undefined && <span className="text-lg font-normal text-faint"> / {c.of}</span>}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-xl border border-line bg-subtle p-5">
          <h2 className="mb-4 text-[14px] font-medium tracking-tight">Documents</h2>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {docs.map((d, i) => (
              <DocTile key={d.id} doc={d} index={i} />
            ))}
          </ul>
        </section>

        <div className="space-y-5">
          <section className="rounded-xl border border-line bg-subtle p-5">
            <h2 className="mb-4 text-[14px] font-medium tracking-tight">Pipeline</h2>
            <ol className="space-y-1">
              {stages.map((s, i) => {
                const idx = STAGES.indexOf(s);
                const state = failed && idx === activeStage ? "failed" : idx < activeStage ? "done" : idx === activeStage ? "active" : "pending";
                return (
                  <li key={s.key} className="flex gap-3 rounded-lg px-2 py-2">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center">
                      {state === "done" && (
                        <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }} className="grid size-5 place-items-center rounded-full bg-success-soft">
                          <Check className="size-3 text-success" strokeWidth={3} />
                        </motion.span>
                      )}
                      {state === "active" && <LoaderCircle className="size-4 animate-spin text-accent" />}
                      {state === "failed" && <CircleAlert className="size-4 text-danger" />}
                      {state === "pending" && <span className="size-2 rounded-full bg-line-strong" />}
                    </span>
                    <span className="min-w-0">
                      <span className={clsx("block text-[13.5px]", state === "pending" ? "text-faint" : "text-fg")}>{s.label}</span>
                      {(state === "active" || state === "failed") && (
                        <motion.span initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="block text-[12px] text-muted">
                          {s.hint}
                        </motion.span>
                      )}
                    </span>
                    <span className="sr-only">{i}</span>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="rounded-xl border border-line bg-subtle p-5">
            <h2 className="mb-3 text-[14px] font-medium tracking-tight">Activity</h2>
            <div ref={feedRef} className="no-scrollbar h-56 space-y-1.5 overflow-y-auto font-mono text-[11.5px] leading-snug">
              <AnimatePresence initial={false}>
                {events.map((e) => (
                  <motion.p
                    key={e.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={clsx(e.level === "error" ? "text-danger" : e.level === "warn" ? "text-warning" : "text-muted")}
                    style={e.level === "warn" ? { color: "var(--warning)" } : undefined}
                  >
                    <span className="text-faint">{new Date(e.at).toLocaleTimeString("en-AU", { hour12: false })}</span> {e.message}
                  </motion.p>
                ))}
              </AnimatePresence>
              {!events.length && <p className="text-faint">Waiting for the scanner…</p>}
            </div>
          </section>
        </div>
      </div>

      <AnimatePresence>
        {complete && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-success/40 bg-success-soft p-5">
            <div>
              <p className="text-[15px] font-medium">
                Scan complete: {scan.findingCount} {scan.findingCount === 1 ? "finding" : "findings"} across {scan.claimCount} claims
              </p>
              <p className="mt-0.5 text-[13px] text-muted">{redirecting ? "Opening results…" : "Opening the results in a moment."}</p>
            </div>
            <Link href={withScan("/results", scanId)} className="group inline-flex items-center gap-2 rounded-md bg-fg px-4 py-2.5 text-[13.5px] font-medium text-bg transition hover:bg-white active:scale-[0.97]">
              View results
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
  );
}

function DocTile({ doc, index }: { doc: ScanDocState; index: number }) {
  const reading = doc.status === "reading";
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: doc.status === "queued" ? 0.55 : 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.04, type: "spring", stiffness: 340, damping: 30 }}
      className={clsx(
        "relative overflow-hidden rounded-lg border bg-bg p-3 transition-colors",
        reading ? "border-accent" : doc.status === "error" ? "border-danger/50" : "border-line",
      )}
    >
      {reading && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-8"
          style={{ background: "linear-gradient(to bottom, transparent, rgba(0,112,243,0.22), transparent)" }}
          initial={{ top: "-30%" }}
          animate={{ top: "110%" }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
        />
      )}
      <div className="relative flex items-start gap-2.5">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-line bg-elevated">
          <FileText className={clsx("size-3.5", reading ? "text-accent" : "text-muted")} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium">{doc.title ?? doc.name}</span>
          <span className="block truncate text-[11.5px] text-faint">
            {doc.status === "queued" && "Waiting"}
            {reading && "Reading…"}
            {doc.status === "done" && `${doc.reused ? "Already read · " : ""}${doc.claims} ${doc.claims === 1 ? "claim" : "claims"}${doc.source ? ` · ${doc.source}` : ""}`}
            {doc.status === "error" && (doc.error ?? "Could not be read")}
          </span>
        </span>
        <span className="mt-0.5 shrink-0">
          {doc.status === "done" && (
            <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }} className="grid size-4 place-items-center rounded-full bg-success-soft">
              <Check className="size-2.5 text-success" strokeWidth={3.5} />
            </motion.span>
          )}
          {reading && <LoaderCircle className="size-3.5 animate-spin text-accent" />}
          {doc.status === "error" && <CircleAlert className="size-3.5 text-danger" />}
        </span>
      </div>
    </motion.li>
  );
}
