"use client";

import { motion } from "motion/react";
import { useDashboard } from "@/components/live-provider";

const SEGMENTS = [
  { key: "corroborated", label: "Corroborated", color: "var(--success)" },
  { key: "single", label: "Single source", color: "var(--fg-faint)" },
  { key: "review", label: "Needs review", color: "var(--warning)" },
  { key: "superseded", label: "Superseded", color: "var(--disinfo)" },
] as const;

export function SourceWatch() {
  const SOURCE_WATCH = useDashboard().sourceWatch;
  return (
    <div>
      <ul className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
        {SOURCE_WATCH.map((s, r) => {
          const total = s.corroborated + s.single + s.review + s.superseded || 1;
          return (
            <motion.li
              key={s.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + r * 0.06, duration: 0.4 }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13px] font-medium">{s.name}</p>
                <p className="truncate text-[11.5px] text-faint">{s.note}</p>
              </div>
              <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${s.name} reliability record`}>
                {SEGMENTS.map((seg, i) => {
                  const n = s[seg.key];
                  if (!n) return null;
                  return (
                    <motion.div
                      key={seg.key}
                      title={`${seg.label}: ${n}`}
                      style={{ background: seg.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(n / total) * 100}%` }}
                      transition={{ duration: 0.8, delay: 0.45 + r * 0.06 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                      className="border-r border-bg last:border-r-0"
                    />
                  );
                })}
              </div>
            </motion.li>
          );
        })}
      </ul>

      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3">
        {SEGMENTS.map((seg) => (
          <span key={seg.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
            <span className="size-2 rounded-sm" style={{ background: seg.color }} />
            {seg.label}
          </span>
        ))}
      </div>
    </div>
  );
}
