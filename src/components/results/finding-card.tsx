"use client";

import { motion } from "motion/react";
import { ChevronRight, FileText, Sparkles } from "lucide-react";
import { TypeIcon } from "@/components/type-badge";
import { StatusPill, SeverityDot } from "@/components/results/status-pill";
import { KIND_LABEL, TYPE_META } from "@/lib/meta";
import { sourceNamesOf } from "@/lib/results-derive";
import type { Finding, SourceDoc } from "@/lib/types";

export function FindingCard({
  finding,
  docs,
  showNew,
  onOpen,
}: {
  finding: Finding;
  docs: SourceDoc[];
  showNew?: boolean;
  onOpen: (id: string) => void;
}) {
  const m = TYPE_META[finding.type];
  const sources = sourceNamesOf(finding, docs);
  const resolved = finding.status !== "open";

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: resolved ? 0.72 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
    >
      <button
        type="button"
        onClick={() => onOpen(finding.id)}
        className="group relative flex w-full gap-3.5 rounded-xl border border-line bg-subtle p-4 text-left transition-colors hover:border-line-strong hover:bg-elevated"
      >
        <span className="absolute inset-y-3 left-0 w-0.5 rounded-full" style={{ background: m.color }} aria-hidden />
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md" style={{ background: m.soft, color: m.color }}>
          <TypeIcon type={finding.type} className="size-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-[14px] font-medium leading-snug">{finding.title}</span>
            {showNew && finding.isNew && (
              <span className="rounded-full bg-accent-soft px-1.5 py-px text-[10.5px] font-medium text-accent">New</span>
            )}
          </span>
          <span className="mt-1 line-clamp-2 block text-[12.5px] leading-relaxed text-muted">{finding.summary}</span>

          <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-faint">
            <StatusPill status={finding.status} />
            <span className="rounded border border-line px-1.5 py-0.5 text-muted">{KIND_LABEL[finding.kind]}</span>
            <SeverityDot severity={finding.severity} />
            <span className="inline-flex items-center gap-1">
              <FileText className="size-3" />
              {finding.docIds.length} {finding.docIds.length === 1 ? "document" : "documents"}
            </span>
            {finding.aiReview && (
              <span
                className="inline-flex items-center gap-1"
                title={finding.aiReview.rationale}
                style={{ color: finding.aiReview.verdict === "agree" ? "var(--success)" : finding.aiReview.verdict === "disagree" ? "var(--warning)" : "var(--fg-muted)" }}
              >
                <Sparkles className="size-3" />
                AI {finding.aiReview.verdict === "agree" ? "agrees" : finding.aiReview.verdict === "disagree" ? "disagrees" : "unsure"}
              </span>
            )}
            <span className="hidden truncate sm:inline">
              {sources.slice(0, 2).join(", ")}
              {sources.length > 2 ? ` +${sources.length - 2}` : ""}
            </span>
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end justify-between">
          <span className="text-right">
            <span className="block text-lg font-semibold leading-none tabular-nums">{finding.confidence}%</span>
            <span className="mt-1 block text-[10.5px] text-faint">confidence</span>
            <span className="mt-1.5 block h-1 w-12 overflow-hidden rounded-full bg-line">
              <motion.span
                className="block h-full rounded-full"
                style={{ background: m.color }}
                initial={{ width: 0 }}
                animate={{ width: `${finding.confidence}%` }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              />
            </span>
          </span>
          <ChevronRight className="size-4 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
        </span>
      </button>
    </motion.li>
  );
}
