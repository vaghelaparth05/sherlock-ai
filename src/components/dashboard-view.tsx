"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { TopNav } from "@/components/top-nav";
import { Reveal } from "@/components/reveal";
import { Panel } from "@/components/panel";
import { ErrorBlock, NoScans, Skeleton } from "@/components/page-states";
import { ContinueCard } from "@/components/dashboard/continue-card";
import { StatCards } from "@/components/dashboard/stat-cards";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { TypeBreakdown } from "@/components/dashboard/type-breakdown";
import { InvestigationsTable } from "@/components/dashboard/investigations-table";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { SourceWatch } from "@/components/dashboard/source-watch";
import { useFetch } from "@/lib/client";
import type { DashboardPayload } from "@/lib/types";

export function DashboardView() {
  const { data, error, loading, reload } = useFetch<DashboardPayload>("/api/dashboard");
  const scanId = data?.last?.scanId ?? null;

  return (
    <div className="relative min-h-screen">
      <div className="grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-[380px]" aria-hidden />
      <TopNav active="dashboard" scanId={scanId} />

      <main className="relative mx-auto max-w-6xl space-y-5 px-5 pb-24 pt-10">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{data?.last ? "Welcome back" : "Welcome to Sherlock"}</h1>
            <p className="mt-2 text-[15px] text-muted">
              {data?.last ? "Here is where your investigations stand." : "An investigator for the National Archives of Australia's document collections."}
            </p>
          </div>
          <Link href="/import" className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-elevated px-3.5 py-2 text-[13px] font-medium transition hover:bg-hover active:scale-[0.97]">
            <Plus className="size-4" />
            New investigation
          </Link>
        </Reveal>

        {loading && <Skeleton rows={2} />}
        {error && <ErrorBlock message={error} onRetry={reload} />}
        {data && !data.last && !data.investigations.length && <NoScans />}

        {data && (data.last || data.investigations.length > 0) && (
          <>
            {data.last && <ContinueCard last={data.last} />}
            <StatCards kpis={data.kpis} trend={data.trend} />

            <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
              <Panel title="Findings over time" description="Found versus resolved, per week" delay={0.15}>
                <TrendChart trend={data.trend} />
              </Panel>
              <Panel title="Open by type" description="Across all investigations" action={{ label: "Review", href: scanId ? `/review?scan=${scanId}` : "/review" }} delay={0.2}>
                <TypeBreakdown openByType={data.openByType} scanId={scanId} />
              </Panel>
            </div>

            <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
              <Panel title="Investigations" description="Everything you have imported" action={{ label: "Import more", href: "/import" }} delay={0.25}>
                <InvestigationsTable items={data.investigations} />
              </Panel>
              <Panel title="Recent activity" description="Your decisions and Sherlock's scans" delay={0.3}>
                <ActivityFeed items={data.activity} />
              </Panel>
            </div>

            {data.sourceWatch.length > 0 && (
              <Panel title="Source watchlist" description="Sources whose claims were superseded, repeated or left unchecked" delay={0.35}>
                <SourceWatch items={data.sourceWatch} />
              </Panel>
            )}
          </>
        )}
      </main>
    </div>
  );
}
