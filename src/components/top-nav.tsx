"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { LayoutDashboard, LogOut, Search } from "lucide-react";
import clsx from "clsx";
import { logoutAction } from "@/app/actions/auth";

const STEPS = ["Import", "Scan", "Results", "Review", "Summary"] as const;

export function TopNav({ active = -1, current }: { active?: number; current?: "dashboard" }) {
  const onDashboard = current === "dashboard";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="Sherlock.ai home">
            <span className="grid size-7 place-items-center rounded-md border border-line-strong bg-elevated">
              <Search className="size-3.5 text-fg" strokeWidth={2.25} />
            </span>
            <span className="text-sm font-semibold tracking-tight">Sherlock.ai</span>
            <span className="ml-1 hidden rounded-full border border-line px-2 py-0.5 text-[11px] text-muted sm:inline">
              Investigator
            </span>
          </Link>
        </motion.div>

        <nav aria-label="Main" className="flex items-center gap-1">
          <Link
            href="/dashboard"
            aria-current={onDashboard ? "page" : undefined}
            className={clsx(
              "relative inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] transition-colors hover:text-fg sm:px-3",
              onDashboard ? "text-fg" : "text-faint",
            )}
          >
            <LayoutDashboard className="size-3.5 sm:hidden" />
            <span className="hidden sm:inline">Dashboard</span>
            {onDashboard && (
              <motion.span
                layoutId="nav-underline"
                className="absolute inset-x-2 -bottom-[15px] h-px bg-fg"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
          </Link>

          <span aria-hidden className="mx-1.5 hidden h-4 w-px bg-line sm:block" />

          {STEPS.map((label, i) => {
            const isActive = i === active;
            return (
              <div
                key={label}
                aria-current={isActive ? "step" : undefined}
                className={clsx(
                  "relative px-2.5 py-1.5 text-[13px] transition-colors sm:px-3",
                  isActive ? "text-fg" : "text-faint",
                )}
              >
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{i + 1}</span>
                {isActive && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute inset-x-2 -bottom-[15px] h-px bg-fg"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
              </div>
            );
          })}

          <span aria-hidden className="mx-1.5 hidden h-4 w-px bg-line sm:block" />

          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] text-faint transition hover:text-fg"
              title="Log out"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
