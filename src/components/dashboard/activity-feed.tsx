"use client";

import { motion } from "motion/react";
import { TypeIcon } from "@/components/type-badge";
import { ACTIVITY, TYPE_META } from "@/lib/mock-dashboard";

export function ActivityFeed() {
  return (
    <ol className="relative space-y-4">
      <span aria-hidden className="absolute bottom-2 left-[13px] top-2 w-px bg-line" />
      {ACTIVITY.map((a, i) => {
        const color = a.type === "system" ? "var(--fg-muted)" : TYPE_META[a.type].color;
        const soft = a.type === "system" ? "var(--bg-elevated)" : TYPE_META[a.type].soft;
        return (
          <motion.li
            key={a.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.07, duration: 0.4 }}
            className="relative flex gap-3"
          >
            <span
              className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full border border-bg"
              style={{ background: soft, color }}
            >
              <TypeIcon type={a.type} className="size-3.5" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[13px] leading-snug">{a.text}</p>
              <p className="mt-0.5 text-[11.5px] text-faint">
                {a.where} · {a.when}
              </p>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
