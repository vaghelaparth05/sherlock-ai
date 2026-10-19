"use client";

import { motion } from "motion/react";
import { AnimatedNumber } from "@/components/animated-number";
import { KPIS } from "@/lib/mock-dashboard";

export function StatCards() {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-subtle lg:grid-cols-4">
      {KPIS.map((k, i) => (
        <motion.div
          key={k.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="p-4"
        >
          <p className="text-[12px] text-muted">{k.label}</p>
          <div className="mt-2 flex items-end justify-between gap-2">
            <p className="text-2xl font-semibold leading-none tracking-tight tabular-nums">
              <AnimatedNumber value={k.value} />
              {k.suffix && <span className="text-xl text-muted">{k.suffix}</span>}
            </p>
          </div>
          <p className="mt-2 text-[11.5px] text-muted">{k.delta}</p>
        </motion.div>
      ))}
    </div>
  );
}
