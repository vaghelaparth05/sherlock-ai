"use client";

import { motion } from "motion/react";
import clsx from "clsx";
import { TYPE_META } from "@/lib/mock-dashboard";
import { SEVERITIES, TYPES } from "@/lib/results-derive";
import type { FindingType, Severity } from "@/lib/results-data";

/** Open findings by type and severity. Click a cell to filter the list to it. */
export function SeverityMap({
  matrix,
  active,
  onPick,
}: {
  matrix: Record<FindingType, Record<Severity, number>>;
  active: { type: FindingType | "all"; severity: Severity | "all" };
  onPick: (type: FindingType, severity: Severity) => void;
}) {
  const max = Math.max(1, ...TYPES.flatMap((t) => SEVERITIES.map((s) => matrix[t][s])));

  return (
    <div>
      <div className="grid grid-cols-[88px_repeat(3,1fr)] gap-1.5 text-[11px] text-faint">
        <span />
        {SEVERITIES.map((s) => (
          <span key={s} className="pb-0.5 text-center capitalize">
            {s}
          </span>
        ))}

        {TYPES.map((t) => (
          <div key={t} className="contents">
            <span className="self-center truncate pr-1 text-[12px] text-muted">{TYPE_META[t].label}</span>
            {SEVERITIES.map((s, si) => {
              const n = matrix[t][s];
              const isActive = active.type === t && active.severity === s;
              return (
                <motion.button
                  key={s}
                  type="button"
                  onClick={() => onPick(t, s)}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.96 }}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.15 + si * 0.05 }}
                  aria-label={`${n} open ${s} ${TYPE_META[t].label} findings`}
                  className={clsx(
                    "grid h-11 place-items-center rounded-md border text-[14px] font-semibold tabular-nums transition-colors",
                    isActive ? "border-fg" : "border-line hover:border-line-strong",
                  )}
                  style={{
                    background: n ? `color-mix(in srgb, ${TYPE_META[t].color} ${Math.round(14 + (n / max) * 38)}%, transparent)` : "transparent",
                    color: n ? "var(--fg)" : "var(--fg-faint)",
                  }}
                >
                  {n}
                </motion.button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
