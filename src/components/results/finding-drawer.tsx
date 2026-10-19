"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Check, RotateCcw, X } from "lucide-react";
import { TypeBadge } from "@/components/type-badge";
import { Highlight } from "@/components/results/highlight";
import { SeverityDot, StatusPill } from "@/components/results/status-pill";
import { CLAIMS, KIND_LABEL, type Finding, type FindingStatus } from "@/lib/results-data";
import { docById } from "@/lib/results-derive";

const CLAIM_LABEL: Record<string, { label: string; color: string }> = {
  corroborated: { label: "Corroborated", color: "var(--success)" },
  current: { label: "Current", color: "var(--success)" },
  single: { label: "Single source", color: "var(--fg-muted)" },
  review: { label: "Needs review", color: "var(--misinfo)" },
  superseded: { label: "Superseded", color: "var(--disinfo)" },
};

export function FindingDrawer({
  finding,
  onClose,
  onDecide,
}: {
  finding: Finding | null;
  onClose: () => void;
  onDecide: (id: string, status: FindingStatus) => void;
}) {
  useEffect(() => {
    if (!finding) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finding, onClose]);

  return (
    <AnimatePresence>
      {finding && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
            aria-hidden
          />
          <motion.aside
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label={finding.title}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-line-strong bg-bg shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-line p-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <TypeBadge type={finding.type} />
                  <span className="rounded border border-line px-1.5 py-0.5 text-[11.5px] text-muted">{KIND_LABEL[finding.kind]}</span>
                  <SeverityDot severity={finding.severity} />
                </div>
                <h2 className="mt-3 text-lg font-semibold leading-snug tracking-tight">{finding.title}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-md p-1.5 text-muted transition hover:bg-hover hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              <section>
                <p className="text-[13.5px] leading-relaxed text-muted">{finding.summary}</p>
                <div className="mt-3 flex items-center gap-3 text-[12px] text-faint">
                  <StatusPill status={finding.status} />
                  <span>{finding.confidence}% confidence</span>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-faint">Evidence</h3>
                <div className="space-y-2">
                  {finding.evidence.map((e, i) => {
                    const d = e.docId ? docById(e.docId) : undefined;
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.12 + i * 0.07 }}
                        className="rounded-lg border border-line bg-subtle p-3"
                      >
                        <p className="text-[11px] uppercase tracking-wide text-faint">{e.label}</p>
                        <p className={e.mono ? "mt-1 font-mono text-[12.5px] leading-snug" : "mt-1 text-[13px] leading-snug"}>
                          <Highlight text={e.quote} />
                        </p>
                        {d && (
                          <p className="mt-1.5 text-[11.5px] text-faint">
                            {d.title} · {d.source} · {d.year}
                          </p>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </section>

              {finding.claimIds.length > 0 && (
                <section>
                  <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-faint">Related claims</h3>
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {finding.claimIds.map((id) => {
                      const c = CLAIMS.find((x) => x.id === id);
                      if (!c) return null;
                      const l = CLAIM_LABEL[c.status];
                      const origin = docById(c.origin);
                      return (
                        <li key={id} className="flex items-start justify-between gap-3 p-3">
                          <div className="min-w-0">
                            <p className="text-[13px]">{c.text}</p>
                            <p className="mt-0.5 text-[11.5px] text-faint">
                              Started in {origin?.title} · stated in {c.citedBy.length} {c.citedBy.length === 1 ? "document" : "documents"}
                            </p>
                          </div>
                          <span className="shrink-0 text-[11.5px]" style={{ color: l.color }}>
                            {l.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-faint">
                  Affected documents ({finding.docIds.length})
                </h3>
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {finding.docIds.map((id) => {
                    const d = docById(id);
                    if (!d) return null;
                    return (
                      <li key={id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
                        <span className="truncate">{d.title}</span>
                        <span className="shrink-0 text-[11.5px] text-faint">
                          {d.source} · {d.year}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>

            <div className="border-t border-line p-4">
              {finding.status === "open" ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onDecide(finding.id, "confirmed")}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-fg px-4 py-2.5 text-[13.5px] font-medium text-bg transition hover:bg-white active:scale-[0.98]"
                  >
                    <Check className="size-4" />
                    Confirm finding
                  </button>
                  <button
                    type="button"
                    onClick={() => onDecide(finding.id, "dismissed")}
                    className="rounded-md border border-line-strong px-4 py-2.5 text-[13.5px] transition hover:bg-hover active:scale-[0.98]"
                  >
                    Dismiss
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onDecide(finding.id, "open")}
                    className="inline-flex items-center gap-2 rounded-md border border-line-strong px-3.5 py-2 text-[13px] transition hover:bg-hover active:scale-[0.98]"
                  >
                    <RotateCcw className="size-3.5" />
                    Reopen
                  </button>
                  <Link href="/review" className="text-[12.5px] text-muted underline-offset-4 hover:text-fg hover:underline">
                    Go to review queue
                  </Link>
                </div>
              )}
              <p className="mt-2 text-center text-[11px] text-faint">Sample data: decisions reset when you refresh.</p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
