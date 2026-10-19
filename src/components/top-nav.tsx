"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import clsx from "clsx";
import { AppearanceToggle } from "@/components/appearance-toggle";

const STEPS = [
  { label: "Import", href: "/import" },
  { label: "Scan", href: "/scan" },
  { label: "Results", href: "/results" },
  { label: "Review", href: "/review" },
  { label: "Summary" },
] as const;

export function TopNav({ active = -1, current }: { active?: number; current?: "dashboard" }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-5 px-5 lg:flex-nowrap">
        <Link href="/dashboard" className="flex h-14 items-center gap-2.5" aria-label="Sherlock.ai home">
          <span className="grid size-7 place-items-center rounded-md border border-line-strong bg-elevated">
            <Search className="size-3.5" strokeWidth={2.25} />
          </span>
          <span className="text-sm font-semibold tracking-tight">Sherlock.ai</span>
        </Link>
        <nav aria-label="Main" className="order-last flex w-full items-center overflow-x-auto lg:order-none lg:w-auto">
          {[{ label: "Dashboard", href: "/dashboard" }, ...STEPS].map((step, index) => {
            const selected = index === 0 ? current === "dashboard" : active === index - 1;
            const className = clsx("shrink-0 border-b-2 px-3 py-3 text-[13px] transition-colors", selected ? "border-fg font-medium text-fg" : "border-transparent text-muted hover:text-fg");
            return "href" in step ? (
              <Link key={step.label} href={step.href} aria-current={selected ? "page" : undefined} className={className}>{step.label}</Link>
            ) : (
              <span key={step.label} aria-disabled="true" title="Summary is coming soon" className="shrink-0 border-b-2 border-transparent px-3 py-3 text-[13px] text-muted">{step.label}</span>
            );
          })}
        </nav>
        <AppearanceToggle />
      </div>
    </header>
  );
}
