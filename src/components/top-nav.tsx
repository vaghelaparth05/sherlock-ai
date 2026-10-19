"use client";

import Link from "next/link";
import { LogOut, Search } from "lucide-react";
import clsx from "clsx";
import { AppearanceToggle } from "@/components/appearance-toggle";
import { useLive } from "@/components/live-provider";

const STEPS = [
  { label: "Import", href: "/import" },
  { label: "Results", href: "/results" },
  { label: "Review", href: "/review" },
  { label: "Register", href: "/register" },
] as const;

type Page = "dashboard" | "uploads" | "assistant" | "submit";

export function TopNav({ active = -1, current }: { active?: number; current?: Page }) {
  const { user, dashboard, signOut } = useLive();
  const manager = user?.role === "information_manager";
  const awaiting = dashboard?.kpis.find((k) => k.label === "Awaiting your review")?.value ?? 0;
  const links = manager
    ? [{ label: "Dashboard", href: "/dashboard", on: current === "dashboard" }, ...STEPS.map((s, i) => ({ ...s, on: active === i })),
       { label: "Uploads", href: "/uploads", on: current === "uploads", badge: awaiting }, { label: "Assistant", href: "/assistant", on: current === "assistant" }]
    : [{ label: "Submit a record", href: "/submit", on: current === "submit" }, { label: "Assistant", href: "/assistant", on: current === "assistant" }];

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-5 px-5 lg:flex-nowrap">
        <Link href={manager || !user ? "/dashboard" : "/submit"} className="flex h-14 items-center gap-2.5" aria-label="Sherlock.ai home">
          <span className="grid size-7 place-items-center rounded-md border border-line-strong bg-elevated">
            <Search className="size-3.5" strokeWidth={2.25} />
          </span>
          <span className="text-sm font-semibold tracking-tight">Sherlock.ai</span>
        </Link>
        <nav aria-label="Main" className="order-last flex w-full items-center overflow-x-auto lg:order-none lg:w-auto">
          {links.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              aria-current={l.on ? "page" : undefined}
              className={clsx("inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-[13px] transition-colors", l.on ? "border-fg font-medium text-fg" : "border-transparent text-muted hover:text-fg")}
            >
              {l.label}
              {"badge" in l && l.badge ? <span className="rounded-full bg-accent px-1.5 text-[10.5px] font-medium text-white tabular-nums">{l.badge}</span> : null}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <button type="button" onClick={signOut} title="Sign out" className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12px] text-muted transition hover:bg-hover hover:text-fg">
              {user.name} · {manager ? "Information manager" : "Contributor"}
              <LogOut className="size-3.5" />
            </button>
          ) : (
            <Link href="/sign-in" className="rounded-md border border-line px-2.5 py-1.5 text-[12px] text-muted transition hover:bg-hover hover:text-fg">Sign in</Link>
          )}
          <AppearanceToggle />
        </div>
      </div>
    </header>
  );
}
