"use client";

import { motion } from "motion/react";
import { Search } from "lucide-react";
import clsx from "clsx";

const STEPS = ["Import", "Scan", "Results", "Review", "Summary"] as const;

export function TopNav({ active = 0 }: { active?: number }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex items-center gap-2.5"
        >
          <span className="grid size-7 place-items-center rounded-md border border-line-strong bg-elevated">
            <Search className="size-3.5 text-fg" strokeWidth={2.25} />
          </span>
          <span className="text-sm font-semibold tracking-tight">Sherlock.ai</span>
          <span className="ml-1 hidden rounded-full border border-line px-2 py-0.5 text-[11px] text-muted sm:inline">
            Investigator
          </span>
        </motion.div>

        <nav aria-label="Progress" className="flex items-center gap-1">
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
        </nav>
      </div>
    </header>
  );
}
