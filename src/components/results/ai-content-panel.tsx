"use client";

import { motion } from "motion/react";
import { Bot, ShieldCheck } from "lucide-react";
import { TypeIcon } from "@/components/type-badge";
import { FindingCard } from "@/components/results/finding-card";
import { TYPE_META } from "@/lib/meta";
import { TYPES } from "@/lib/results-derive";
import type { Finding, SourceDoc } from "@/lib/types";

/** Findings that touch AI-written content, grouped under the AI document they concern. */
export function aiContentOf(docs: SourceDoc[], findings: Finding[]) {
  const ai = docs.filter((d) => d.aiGenerated);
  const ids = new Set(ai.map((d) => d.id));
  const touching = findings.filter((f) => f.docIds.some((id) => ids.has(id)));
  return { ai, touching };
}

export function AiContentPanel({ docs, findings, onOpen }: { docs: SourceDoc[]; findings: Finding[]; onOpen: (id: string) => void }) {
  const { ai, touching } = aiContentOf(docs, findings);

  if (ai.length === 0) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-line-strong bg-subtle px-6 py-14 text-center">
        <ShieldCheck className="size-6 text-faint" />
        <p className="mt-3 text-[14px] font-medium">No AI-written content in this collection</p>
        <p className="mt-1 max-w-sm text-[12.5px] text-muted">Sherlock looks for documents that say an AI wrote or summarised them, then checks them against the authoritative records.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-muted">
        These documents say an AI wrote them. Nobody has signed off on them, so Sherlock checks each one against the authoritative records for wrong or outdated figures, missing
        conditions and unsupported claims.
      </p>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {TYPES.map((t, i) => {
          const m = TYPE_META[t];
          const list = touching.filter((f) => f.type === t);
          const open = list.filter((f) => f.status === "open").length;
          return (
            <motion.div key={t} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.4 }} className="rounded-xl border border-line bg-subtle p-4">
              <span className="inline-flex items-center gap-2 text-[13px] font-medium">
                <span className="grid size-7 place-items-center rounded-md" style={{ background: m.soft, color: m.color }}>
                  <TypeIcon type={t} className="size-3.5" />
                </span>
                {m.label}
              </span>
              <p className="mt-3 text-3xl font-semibold leading-none tracking-tight tabular-nums" style={{ color: list.length ? m.color : "var(--fg-faint)" }}>
                {list.length}
                <span className="ml-1.5 text-[13px] font-normal text-muted">{open === list.length ? "open" : `${open} open`}</span>
              </p>
            </motion.div>
          );
        })}
      </div>

      <div className="space-y-6">
        {ai.map((d) => {
          const list = touching.filter((f) => f.docIds.includes(d.id));
          return (
            <section key={d.id}>
              <div className="mb-2.5 flex items-center gap-2.5">
                <span className="grid size-7 place-items-center rounded-md border border-line-strong bg-elevated">
                  <Bot className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{d.title}</p>
                  <p className="text-[12px] text-faint">
                    {d.source} · AI-generated · {list.length} {list.length === 1 ? "finding" : "findings"}
                  </p>
                </div>
              </div>
              {list.length === 0 ? (
                <p className="rounded-xl border border-line bg-subtle px-4 py-3 text-[12.5px] text-muted">Checked against the authoritative records. Nothing to flag.</p>
              ) : (
                <ul className="space-y-2.5">
                  {list.map((f) => (
                    <FindingCard key={f.id} finding={f} docs={docs} onOpen={onOpen} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
