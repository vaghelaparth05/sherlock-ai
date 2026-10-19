"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { TypeIcon } from "@/components/type-badge";
import { TYPE_META, type FindingType } from "@/lib/mock-dashboard";
import { useDashboard } from "@/components/live-provider";

const ORDER: FindingType[] = ["misinformation", "bias", "disinformation"];

export function TypeBreakdown() {
  const OPEN_BY_TYPE = useDashboard().openByType;
  const total = ORDER.reduce((n, t) => n + OPEN_BY_TYPE[t], 0);

  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-line" role="img" aria-label="Open findings split by type">
        {ORDER.map((t, i) => (
          <motion.div
            key={t}
            style={{ background: TYPE_META[t].color }}
            initial={{ width: 0 }}
            animate={{ width: `${total ? (OPEN_BY_TYPE[t] / total) * 100 : 0}%` }}
            transition={{ duration: 0.9, delay: 0.3 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
            className={i > 0 ? "border-l border-bg" : ""}
          />
        ))}
      </div>

      <ul className="mt-4 divide-y divide-line">
        {ORDER.map((t) => {
          const m = TYPE_META[t];
          return (
            <li key={t}>
              <Link href="/review" className="group flex items-center gap-3 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-md" style={{ background: m.soft, color: m.color }}>
                  <TypeIcon type={t} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium">{m.label}</span>
                  <span className="block truncate text-[12px] text-faint">{m.blurb}</span>
                </span>
                <span className="text-xl font-semibold tabular-nums">
                  <AnimatedNumber value={OPEN_BY_TYPE[t]} />
                </span>
                <ArrowUpRight className="size-4 text-faint opacity-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
