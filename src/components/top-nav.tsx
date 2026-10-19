"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { LayoutDashboard, Search } from "lucide-react";
import clsx from "clsx";
import { withScan } from "@/lib/client";

export type NavKey = "dashboard" | "import" | "scan" | "results" | "sources" | "review" | "summary" | "data";

const STEPS: { key: NavKey; label: string; href: string; scoped: boolean }[] = [
  { key: "import", label: "Import", href: "/import", scoped: false },
  { key: "scan", label: "Scan", href: "/scan", scoped: true },
  { key: "results", label: "Results", href: "/results", scoped: true },
  { key: "sources", label: "Sources", href: "/sources", scoped: true },
  { key: "review", label: "Review", href: "/review", scoped: true },
  { key: "summary", label: "Summary", href: "/summary", scoped: true },
  { key: "data", label: "Data", href: "/data", scoped: false },
];

export function TopNav({ active, scanId }: { active?: NavKey; scanId?: string | null }) {
  const onDashboard = active === "dashboard";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
        <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: "easeOut" }}>
          <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="Sherlock.ai home">
            <span className="grid size-7 place-items-center rounded-md border border-line-strong bg-elevated">
              <Search className="size-3.5 text-fg" strokeWidth={2.25} />
            </span>
            <span className="text-sm font-semibold tracking-tight">Sherlock.ai</span>
            <span className="ml-1 hidden rounded-full border border-line px-2 py-0.5 text-[11px] text-muted md:inline">National Archives of Australia</span>
          </Link>
        </motion.div>

        <nav aria-label="Main" className="no-scrollbar flex items-center gap-0.5 overflow-x-auto">
          <Link
            href="/dashboard"
            aria-current={onDashboard ? "page" : undefined}
            className={clsx(
              "relative inline-flex items-center gap-1.5 px-2 py-1.5 text-[13px] transition-colors hover:text-fg sm:px-2.5",
              onDashboard ? "text-fg" : "text-faint",
            )}
          >
            <LayoutDashboard className="size-3.5 lg:hidden" />
            <span className="hidden lg:inline">Dashboard</span>
            {onDashboard && <motion.span layoutId="nav-underline" className="absolute inset-x-2 -bottom-[15px] h-px bg-fg" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          </Link>

          <span aria-hidden className="mx-1.5 hidden h-4 w-px bg-line sm:block" />

          {STEPS.map((s) => {
            const isActive = s.key === active;
            return (
              <Link
                key={s.key}
                href={s.scoped ? withScan(s.href, scanId) : s.href}
                aria-current={isActive ? "step" : undefined}
                className={clsx("relative px-2 py-1.5 text-[13px] transition-colors hover:text-fg sm:px-2.5", isActive ? "text-fg" : "text-faint")}
              >
                {s.label}
                {isActive && <motion.span layoutId="nav-underline" className="absolute inset-x-2 -bottom-[15px] h-px bg-fg" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
