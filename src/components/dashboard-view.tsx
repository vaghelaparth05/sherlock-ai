"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { TopNav } from "@/components/top-nav";
import { Reveal } from "@/components/reveal";
import { Panel } from "@/components/panel";
import { ContinueCard } from "@/components/dashboard/continue-card";
import { StatCards } from "@/components/dashboard/stat-cards";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { TypeBreakdown } from "@/components/dashboard/type-breakdown";
import { InvestigationsTable } from "@/components/dashboard/investigations-table";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { SourceWatch } from "@/components/dashboard/source-watch";
import { useRequireUser } from "@/components/live-provider";

export function DashboardView() {
  useRequireUser("information_manager");
  return (
    <div className="relative min-h-screen">
      <div className="grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-[380px]" aria-hidden />
      <TopNav current="dashboard" />

      <main className="relative mx-auto max-w-6xl space-y-5 px-5 pb-24 pt-10">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Welcome back</h1>
            <p className="mt-2 text-[15px] text-muted">Here is where your investigations stand.</p>
          </div>
          <Link
            href="/import"
            className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-elevated px-3.5 py-2 text-[13px] font-medium transition hover:bg-hover active:scale-[0.97]"
          >
            <Plus className="size-4" />
            New investigation
          </Link>
        </Reveal>

        <ContinueCard />
        <StatCards />

        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <Panel title="Investigations" description="Everything you have imported" action={{ label: "Import more", href: "/import" }} delay={0.25}>
            <InvestigationsTable />
          </Panel>
          <Panel title="Recent activity" description="Your decisions and Sherlock's flags" delay={0.3}>
            <ActivityFeed />
          </Panel>
        </div>

        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <Panel title="Findings over time" description="Raised versus resolved since the collection was loaded" delay={0.15}>
            <TrendChart />
          </Panel>
          <Panel title="Open by type" description="Across all investigations" action={{ label: "Review", href: "/review" }} delay={0.2}>
            <TypeBreakdown />
          </Panel>
        </div>

        <Panel
          title="Source watchlist"
          description="Sources whose claims have been superseded, repeated or left unchecked"
          delay={0.35}
        >
          <SourceWatch />
        </Panel>

        <p className="pt-2 text-center text-[12px] text-faint">
          Live from the register. Numbers update as records arrive and decisions are made.
        </p>
      </main>
    </div>
  );
}
