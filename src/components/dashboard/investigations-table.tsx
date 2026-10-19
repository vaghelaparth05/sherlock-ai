"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, CircleAlert, CircleCheck, LoaderCircle, MessageSquareWarning } from "lucide-react";
import { timeAgo, withScan } from "@/lib/client";
import type { DashboardPayload, InvestigationStatus } from "@/lib/types";

const STATUS: Record<InvestigationStatus, { label: string; color: string; path: string; cta: string }> = {
  "needs-review": { label: "Needs review", color: "var(--misinfo)", path: "/review", cta: "Resume" },
  scanning: { label: "Scanning", color: "var(--accent)", path: "/scan", cta: "Watch" },
  resolved: { label: "Resolved", color: "var(--success)", path: "/results", cta: "Open" },
  failed: { label: "Scan failed", color: "var(--danger)", path: "/scan", cta: "Details" },
};

function StatusIcon({ status }: { status: InvestigationStatus }) {
  const cls = "size-3.5";
  if (status === "scanning") return <LoaderCircle className={`${cls} animate-spin`} />;
  if (status === "resolved") return <CircleCheck className={cls} />;
  if (status === "failed") return <CircleAlert className={cls} />;
  return <MessageSquareWarning className={cls} />;
}

export function InvestigationsTable({ items }: { items: DashboardPayload["investigations"] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((inv, i) => {
        const s = STATUS[inv.status];
        return (
          <motion.li key={inv.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.06, duration: 0.4 }}>
            <Link href={withScan(s.path, inv.scanId)} className="group grid items-center gap-x-4 gap-y-2 py-3.5 sm:grid-cols-[1.6fr_1fr_120px_90px]">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium">{inv.name}</p>
                <p className="text-[12px] text-faint">
                  {inv.documents} documents · {inv.status === "scanning" ? "Scanning now" : timeAgo(inv.lastActive)}
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: s.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${inv.progress * 100}%` }}
                    transition={{ duration: 0.9, delay: 0.4 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                <span className="w-9 text-right text-[12px] text-muted tabular-nums">{Math.round(inv.progress * 100)}%</span>
              </div>

              <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: s.color }}>
                <StatusIcon status={inv.status} />
                {s.label}
              </span>

              <span className="flex items-center justify-between gap-2 text-[12.5px] text-muted sm:justify-end">
                <span className="tabular-nums sm:hidden">{inv.open} open</span>
                <span className="inline-flex items-center gap-1 transition-colors group-hover:text-fg">
                  {s.cta}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </Link>
          </motion.li>
        );
      })}
    </ul>
  );
}
