"use client";

import { motion } from "motion/react";
import { AnimatedNumber } from "@/components/animated-number";

/** Circular progress with the percentage counted up in the middle. */
export function ProgressRing({ value, size = 96, label }: { value: number; size?: number; label?: string }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(value * 100)}% ${label ?? ""}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--fg)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value) }}
          transition={{ duration: 1.1, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-xl font-semibold leading-none tracking-tight tabular-nums">
            <AnimatedNumber value={Math.round(value * 100)} />
            <span className="text-sm text-muted">%</span>
          </p>
          {label && <p className="mt-1 text-[10.5px] text-faint">{label}</p>}
        </div>
      </div>
    </div>
  );
}
