"use client";

import { motion } from "motion/react";
import { AnimatedNumber } from "@/components/animated-number";
import type { ScanSummary } from "@/lib/types";

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Ring chart. Each segment draws itself in turn, with the total counted up in the middle. */
export function Donut({ slices, centerLabel }: { slices: Slice[]; centerLabel: string }) {
  const size = 168;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((n, s) => n + s.value, 0);
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${total} ${centerLabel}: ${slices.map((s) => `${s.value} ${s.label}`).join(", ")}`}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
          {total > 0 &&
            slices.map((s, i) => {
              const len = (s.value / total) * c;
              const gap = slices.filter((x) => x.value > 0).length > 1 ? 3 : 0;
              const el = (
                <motion.circle
                  key={s.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeDashoffset={-offset}
                  initial={{ strokeDasharray: `0 ${c}` }}
                  animate={{ strokeDasharray: `${Math.max(0, len - gap)} ${c}` }}
                  transition={{ duration: 0.9, delay: 0.2 + i * 0.15, ease: [0.16, 1, 0.3, 1] }}
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-3xl font-semibold leading-none tracking-tight tabular-nums">
              <AnimatedNumber value={total} />
            </p>
            <p className="mt-1 text-[11.5px] text-faint">{centerLabel}</p>
          </div>
        </div>
      </div>
      <ul className="min-w-[150px] flex-1 space-y-2.5">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2.5 text-[13px]">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="flex-1 text-muted">{s.label}</span>
            <span className="font-medium tabular-nums">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One horizontal stacked bar per row. */
export function StackedRows({ rows, legend }: { rows: { key: string; label: string; segments: { value: number; color: string; label: string }[] }[]; legend: { label: string; color: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.segments.reduce((n, s) => n + s.value, 0)));
  return (
    <div>
      <ul className="space-y-3.5">
        {rows.map((row, ri) => {
          const total = row.segments.reduce((n, s) => n + s.value, 0);
          return (
            <li key={row.key}>
              <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
                <span className="truncate pr-3">{row.label}</span>
                <span className="tabular-nums text-muted">{total}</span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-line" style={{ width: `${Math.max(8, (total / max) * 100)}%` }}>
                {row.segments.map((s, si) =>
                  s.value ? (
                    <motion.div
                      key={si}
                      title={`${s.label}: ${s.value}`}
                      style={{ background: s.color, flexGrow: s.value }}
                      initial={{ opacity: 0, scaleX: 0 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ duration: 0.7, delay: 0.2 + ri * 0.08 + si * 0.05, ease: [0.16, 1, 0.3, 1] }}
                      className="origin-left border-r border-bg last:border-r-0"
                    />
                  ) : null,
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3">
        {legend.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
            <span className="size-2 rounded-sm" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Ranked horizontal bars with a value on the right. */
export function RankedBars({ items }: { items: { key: string; label: string; sub?: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="text-[13px] text-muted">Nothing to show.</p>;
  return (
    <ul className="space-y-3.5">
      {items.map((it, i) => (
        <li key={it.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="min-w-0 truncate">
              {it.label}
              {it.sub && <span className="ml-2 text-faint">{it.sub}</span>}
            </span>
            <span className="shrink-0 tabular-nums text-muted">{it.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <motion.div
              className="h-full rounded-full"
              style={{ background: it.color }}
              initial={{ width: 0 }}
              animate={{ width: `${(it.value / max) * 100}%` }}
              transition={{ duration: 0.8, delay: 0.2 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Findings per scan over time. One scan shows a single bar and a hint. */
export function ScanHistory({ scans, currentId }: { scans: ScanSummary[]; currentId: string }) {
  const done = scans.filter((s) => s.status === "complete");
  const max = Math.max(1, ...done.map((s) => s.findingCount));
  if (!done.length) return null;
  return (
    <div>
      <div className="flex h-36 items-end gap-3">
        {done.map((s, i) => {
          const carried = s.findingCount - s.newCount;
          const isCurrent = s.id === currentId;
          return (
            <div key={s.id} className="flex flex-1 flex-col items-center gap-2" style={{ maxWidth: 88 }}>
              <span className="text-[11.5px] tabular-nums text-muted">{s.findingCount}</span>
              <div className="flex h-24 w-full flex-col justify-end overflow-hidden rounded-md" title={`${s.newCount} new, ${carried} already seen`}>
                <motion.div
                  className="w-full"
                  style={{ background: "var(--accent)", opacity: isCurrent ? 1 : 0.55 }}
                  initial={{ height: 0 }}
                  animate={{ height: `${(s.newCount / max) * 100}%` }}
                  transition={{ duration: 0.7, delay: 0.2 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                />
                <motion.div
                  className="w-full"
                  style={{ background: "var(--border-strong)" }}
                  initial={{ height: 0 }}
                  animate={{ height: `${(carried / max) * 100}%` }}
                  transition={{ duration: 0.7, delay: 0.25 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <span className={isCurrent ? "text-[11px] text-fg" : "text-[11px] text-faint"}>
                {new Date(s.startedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ background: "var(--accent)" }} />
          New in that scan
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ background: "var(--border-strong)" }} />
          Already seen
        </span>
      </div>
      {done.length < 2 && <p className="mt-3 text-[12.5px] text-faint">Load new documents and scan again to see how the findings change.</p>}
    </div>
  );
}
