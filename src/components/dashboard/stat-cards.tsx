"use client";

import { motion } from "motion/react";
import { AnimatedNumber } from "@/components/animated-number";
import { Sparkline } from "@/components/sparkline";
import type { DashboardPayload } from "@/lib/types";

export function StatCards({ kpis, trend }: { kpis: DashboardPayload["kpis"]; trend: DashboardPayload["trend"] }) {
  const cards = [
    { label: "Open findings", value: kpis.openFindings, note: "Across all investigations", spark: trend.found, color: "var(--misinfo)" },
    { label: "Resolved this week", value: kpis.resolvedThisWeek, note: "Confirmed or dismissed by you", spark: trend.resolved, color: "var(--success)" },
    { label: "Documents under watch", value: kpis.documents, note: "In every collection" },
    { label: "Confirmed by you", value: kpis.agreement, suffix: "%", note: "Share of decisions that confirmed a finding" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((k, i) => (
        <motion.div
          key={k.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          whileHover={{ y: -2 }}
          className="rounded-xl border border-line bg-subtle p-4 transition-colors hover:border-line-strong"
        >
          <p className="text-[12px] text-muted">{k.label}</p>
          <div className="mt-2 flex items-end justify-between gap-2">
            <p className="text-3xl font-semibold leading-none tracking-tight tabular-nums">
              {k.value === null ? <span className="text-faint">–</span> : <AnimatedNumber value={k.value} />}
              {k.value !== null && k.suffix && <span className="text-xl text-muted">{k.suffix}</span>}
            </p>
            {k.spark && k.spark.some((n) => n > 0) && <Sparkline data={k.spark} color={k.color} />}
          </div>
          <p className="mt-3 text-[11.5px] text-faint">{k.note}</p>
        </motion.div>
      ))}
    </div>
  );
}
