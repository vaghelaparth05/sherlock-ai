"use client";

import { motion } from "motion/react";
import { ArrowRight, Fingerprint, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { formatBytes, groupOf, type ImportItem } from "@/lib/format";

export interface ScannerInfo {
  provider: "gemini" | "rules" | "external";
  label: string;
  model: string | null;
  hasKey: boolean;
  forcedRules: boolean;
}

export function SummaryPanel({
  items,
  collectionName,
  nameLocked,
  onNameChange,
  scanner,
  rulesOnly,
  onRulesOnly,
  rereadAll,
  onRereadAll,
  canReread,
  starting,
  error,
  onClear,
  onStart,
}: {
  items: ImportItem[];
  collectionName: string;
  nameLocked: boolean;
  onNameChange: (v: string) => void;
  scanner: ScannerInfo | null;
  rulesOnly: boolean;
  onRulesOnly: (v: boolean) => void;
  rereadAll: boolean;
  onRereadAll: (v: boolean) => void;
  canReread: boolean;
  starting: boolean;
  error: string;
  onClear: () => void;
  onStart: () => void;
}) {
  const ready = items.filter((i) => i.status === "ready");
  const uploading = items.filter((i) => i.status === "uploading").length;
  const failed = items.filter((i) => i.status === "error").length;
  const totalSize = ready.reduce((n, i) => n + i.size, 0);

  const groups = new Map<string, number>();
  ready.forEach((i) => groups.set(groupOf(i.ext), (groups.get(groupOf(i.ext)) ?? 0) + 1));
  const breakdown = [...groups.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...breakdown.map(([, n]) => n));

  const canStart = ready.length > 0 && uploading === 0 && !starting;
  const usingAi = scanner?.provider === "gemini" && !rulesOnly;

  return (
    <aside className="space-y-4 lg:sticky lg:top-20">
      <div className="rounded-xl border border-line bg-subtle p-5">
        <label className="text-[12px] text-muted" htmlFor="collection">
          Collection name
        </label>
        <input
          id="collection"
          value={collectionName}
          disabled={nameLocked}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Regional infrastructure grants"
          className="mt-1.5 w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-[13.5px] outline-none transition placeholder:text-faint focus:border-accent disabled:cursor-not-allowed disabled:text-muted"
        />

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <AnimatedNumber value={ready.length} className="text-3xl font-semibold tracking-tight tabular-nums" />
            <p className="text-[12px] text-muted">ready to scan</p>
          </div>
          <div>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">{formatBytes(totalSize)}</p>
            <p className="text-[12px] text-muted">total size</p>
          </div>
        </div>

        {(uploading > 0 || failed > 0) && (
          <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 text-[12px] text-muted">
            {uploading > 0 && <span>{uploading} uploading… </span>}
            {failed > 0 && <span className="text-danger">{failed} failed</span>}
          </motion.p>
        )}

        {breakdown.length > 0 && (
          <div className="mt-5 space-y-2">
            <p className="text-[12px] text-muted">What is in the collection</p>
            {breakdown.map(([name, n]) => (
              <div key={name} className="flex items-center gap-2 text-[12px]">
                <span className="w-16 shrink-0 text-muted">{name}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                  <motion.div className="h-full rounded-full bg-fg" initial={{ width: 0 }} animate={{ width: `${(n / max) * 100}%` }} transition={{ type: "spring", stiffness: 160, damping: 22 }} />
                </div>
                <span className="w-5 text-right tabular-nums text-muted">{n}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 rounded-lg border border-line bg-bg p-3">
          <p className="flex items-center gap-2 text-[12.5px] font-medium">
            <Sparkles className="size-3.5 text-accent" />
            {scanner ? (scanner.provider === "external" ? "External scanner" : usingAi ? `Gemini${scanner.model ? ` · ${scanner.model}` : ""}` : "Offline rules scanner") : "Checking scanner…"}
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
            {!scanner
              ? ""
              : scanner.provider === "external"
                ? "Documents are read by the external scanner service set in SCANNER_URL."
                : usingAi
                ? "An AI reads each document and reviews every finding."
                : scanner.hasKey
                  ? "Rules only, by your choice. No AI is used."
                  : "No Gemini key found, so a fixed set of rules reads the documents. Add GEMINI_API_KEY to .env.local for AI scanning."}
          </p>
          {scanner?.hasKey && !scanner.forcedRules && (
            <label className="mt-2 flex items-center gap-2 text-[12px] text-muted">
              <input type="checkbox" checked={rulesOnly} onChange={(e) => onRulesOnly(e.target.checked)} className="accent-[var(--accent)]" />
              Use offline rules only
            </label>
          )}
        </div>

        {canReread && (
          <div className="mt-3 text-[11.5px] leading-relaxed text-faint">
            Documents Sherlock has already read are not read again, only checked against the new ones.
            <label className="mt-1.5 flex items-center gap-2 text-[12px] text-muted">
              <input type="checkbox" checked={rereadAll} onChange={(e) => onRereadAll(e.target.checked)} className="accent-[var(--accent)]" />
              Re-read every document anyway
            </label>
          </div>
        )}

        {error && <p className="mt-3 rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p>}

        <button
          type="button"
          onClick={onStart}
          disabled={!canStart}
          className="group mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-fg px-4 py-2.5 text-[13.5px] font-medium text-bg transition hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35"
        >
          {starting ? <LoaderCircle className="size-4 animate-spin" /> : null}
          {starting ? "Starting…" : "Start scanning"}
          {!starting && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />}
        </button>
        {items.length > 0 && (
          <button type="button" onClick={onClear} className="mt-2 w-full rounded-md py-2 text-[12.5px] text-muted transition hover:text-fg">
            Remove all documents
          </button>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-line bg-subtle p-5 text-[12.5px] text-muted">
        <p className="flex gap-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-fg" />
          Originals are stored once and never modified. Every decision is written to a tamper-evident audit log.
        </p>
        <p className="flex gap-2.5">
          <Fingerprint className="mt-0.5 size-4 shrink-0 text-fg" />
          Each file gets a SHA-256 fingerprint on arrival, so later changes can be detected.
        </p>
      </div>
    </aside>
  );
}
