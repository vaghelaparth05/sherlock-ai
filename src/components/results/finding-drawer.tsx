"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check, FileText, X } from "lucide-react";
import { TypeBadge } from "@/components/type-badge";
import { Highlight } from "@/components/results/highlight";
import { StatusPill } from "@/components/results/status-pill";
import { KIND_LABEL, type FindingStatus } from "@/lib/results-data";
import { docById as docIn } from "@/lib/results-derive";
import type { Finding } from "@/lib/findings";
import { useLive } from "@/components/live-provider";

export interface ReviewEntry {
  status: "confirmed" | "dismissed";
  note: string;
  reviewedAt: string;
}

export function FindingDrawer({
  finding,
  onClose,
  onDecide,
  onAction,
  reviewHistory = [],
  busy = false,
}: {
  finding: Finding | null;
  onClose: () => void;
  onDecide: (id: string, status: FindingStatus, note?: string) => void;
  onAction?: (action: NonNullable<Finding["actions"]>[number], note: string) => void;
  reviewHistory?: ReviewEntry[];
  busy?: boolean;
}) {
  const { results } = useLive();
  const CLAIMS = results.claims;
  const docById = (id: string) => docIn(results.docs, id);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [noteError, setNoteError] = useState(false);

  useEffect(() => {
    if (!finding) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), a[href]'),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [finding, onClose]);

  // A different finding starts with an empty note (state adjusted during render, not in an effect).
  const [noteFor, setNoteFor] = useState(finding?.id);
  if (noteFor !== finding?.id) {
    setNoteFor(finding?.id);
    setReviewNote("");
    setNoteError(false);
  }

  function decide(status: Extract<FindingStatus, "confirmed" | "dismissed">) {
    const note = reviewNote.trim();
    if (!note) {
      setNoteError(true);
      return;
    }
    if (finding) onDecide(finding.id, status, note);
  }

  const originIds = new Set(
    finding?.claimIds
      .map((id) => CLAIMS.find((claim) => claim.id === id)?.origin)
      .filter((id): id is string => Boolean(id)) ?? [],
  );

  return (
    <AnimatePresence>
      {finding && (
        <motion.div
          key="finding-dialog-backdrop"
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-3 backdrop-blur-md sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="finding-dialog-title"
            aria-describedby="finding-dialog-summary"
            tabIndex={-1}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 360, damping: 32 }}
            className="my-auto flex max-h-[min(88dvh,820px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-bg/95 shadow-2xl shadow-black/25 outline-none backdrop-blur-xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-7 sm:py-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <TypeBadge type={finding.type} />
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">{KIND_LABEL[finding.kind]}</span>
                  <StatusPill status={finding.status} />
                </div>
                <h2 id="finding-dialog-title" className="mt-3 max-w-3xl text-lg font-semibold leading-snug tracking-tight sm:text-xl">
                  {finding.title}
                </h2>
                <p id="finding-dialog-summary" className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted">
                  {finding.summary}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close finding details"
                className="shrink-0 rounded-lg border border-line p-2 text-muted transition hover:bg-hover hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[1.35fr_0.85fr]">
              <section aria-labelledby="evidence-heading" className="min-w-0 px-5 py-5 sm:px-7">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 id="evidence-heading" className="text-sm font-semibold">Evidence from the archive</h3>
                    <p className="mt-0.5 text-xs text-muted">Review the original excerpts before deciding.</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-elevated px-2.5 py-1 text-[11px] text-muted">{finding.confidence}% AI confidence</span>
                </div>

                <div className="space-y-3">
                  {finding.evidence.map((e, i) => {
                    const doc = e.docId ? docById(e.docId) : undefined;
                    return (
                      <article key={`${e.docId ?? "archive"}-${i}`} className="rounded-xl border border-line bg-subtle p-4 sm:p-4.5">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="rounded-md bg-elevated px-2 py-1 text-[11px] font-medium text-muted">{e.label}</span>
                          {doc && <span className="text-[11px] text-faint">{doc.year}</span>}
                        </div>
                        <blockquote className={e.mono ? "font-mono text-[12px] leading-relaxed" : "text-[13px] leading-relaxed"}>
                          <Highlight text={e.quote} />
                        </blockquote>
                        {doc && (
                          <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-2.5 text-[11.5px] text-muted">
                            <FileText className="size-3.5 shrink-0 text-faint" />
                            <span className="truncate">{doc.title}</span>
                            <span className="shrink-0 text-faint">· {doc.source}</span>
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>

              <aside className="border-t border-line bg-subtle/55 px-5 py-5 sm:px-7 lg:border-l lg:border-t-0">
                <div>
                  <h3 className="text-sm font-semibold">Document trail</h3>
                  <p className="mt-0.5 text-xs text-muted">Records connected to this finding.</p>
                  <ul className="mt-3 space-y-2">
                    {finding.docIds.map((id, index) => {
                      const doc = docById(id);
                      if (!doc) return null;
                      const isOrigin = originIds.has(id);
                      return (
                        <li key={id} className="flex items-center gap-2.5 rounded-lg border border-line bg-bg/75 px-3 py-2.5">
                          <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${isOrigin ? "bg-accent-soft text-accent" : "bg-elevated text-muted"}`}>
                            {isOrigin ? "O" : index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-medium">{doc.title}</span>
                            <span className="block truncate text-[11px] text-faint">{doc.source} · {doc.year}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {originIds.size > 0 && <p className="mt-2 text-[11px] text-faint">O marks the original source of a related claim.</p>}
                </div>

                {finding.claimIds.length > 0 && (
                  <details className="group mt-5 rounded-xl border border-line bg-bg/65 p-3.5">
                    <summary className="cursor-pointer list-none text-[12px] font-medium text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                      Related claims <span className="text-faint">({finding.claimIds.length})</span>
                    </summary>
                    <ul className="mt-3 space-y-3 border-t border-line pt-3">
                      {finding.claimIds.map((id) => {
                        const claim = CLAIMS.find((item) => item.id === id);
                        if (!claim) return null;
                        const origin = docById(claim.origin);
                        return (
                          <li key={id} className="text-[12px] text-muted">
                            <p className="leading-relaxed">{claim.text}</p>
                            <p className="mt-1 text-[11px] text-faint">
                              Origin: {origin?.title ?? "Unknown document"} · repeated in {claim.citedBy.length} {claim.citedBy.length === 1 ? "record" : "records"}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}

                {finding.status !== "open" && reviewHistory.length > 0 && (
                  <section className="mt-5 rounded-xl border border-line bg-bg/65 p-3.5" aria-labelledby="decision-history-heading">
                    <h3 id="decision-history-heading" className="text-[12px] font-semibold text-fg">Review history</h3>
                    <ul className="mt-2 space-y-3">
                      {reviewHistory.map((entry, i) => (
                        <li key={`${entry.reviewedAt}-${i}`} className="border-t border-line pt-2.5 text-[12px] text-muted">
                          <p className="font-medium text-fg">{entry.status === "confirmed" ? "Approved" : "Rejected"} · {entry.reviewedAt}</p>
                          <p className="mt-1 leading-relaxed">{entry.note}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </aside>
            </div>

            <footer className="border-t border-line bg-bg/90 px-5 py-4 sm:px-7">
              {finding.status === "open" ? (
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-medium">Reviewer note <span className="text-danger">Required</span></span>
                    <textarea
                      value={reviewNote}
                      onChange={(event) => {
                        setReviewNote(event.target.value);
                        if (event.target.value.trim()) setNoteError(false);
                      }}
                      rows={2}
                      required
                      aria-invalid={noteError}
                      aria-describedby={noteError ? "review-note-error" : undefined}
                      placeholder="Briefly explain your decision…"
                      className="w-full resize-y rounded-lg border border-line-strong bg-subtle px-3 py-2 text-[12.5px] leading-relaxed outline-none transition placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
                    />
                    {noteError && <span id="review-note-error" className="mt-1 block text-[11px] text-danger">Add a note to record this decision.</span>}
                  </label>
                  <div className="flex gap-2 sm:pb-px">
                    {finding.actions?.map((a) => (
                      <button
                        key={a.label}
                        type="button"
                        onClick={() => (reviewNote.trim() ? onAction?.(a, reviewNote.trim()) : setNoteError(true))}
                        disabled={busy || !reviewNote.trim()}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
                      >
                        {a.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => decide("confirmed")}
                      disabled={busy || !reviewNote.trim()}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-success/30 bg-success-soft px-4 py-2.5 text-[13px] font-semibold text-success transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
                    >
                      <Check className="size-4" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => decide("dismissed")}
                      disabled={busy || !reviewNote.trim()}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-line-strong bg-subtle px-4 py-2.5 text-[13px] font-semibold text-muted transition hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[12px] text-muted">Decision recorded in the ledger. The information manager has final authority.</p>
                  <div className="flex items-center gap-4">
                    <Link href="/review" className="inline-flex items-center gap-1 text-[12px] text-muted transition hover:text-fg">
                      Review queue <ArrowUpRight className="size-3.5" />
                    </Link>

                  </div>
                </div>
              )}
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
