"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useDashboard } from "@/components/live-provider";

export function ContinueCard() {
  const L = useDashboard().lastInvestigation;
  const openTotal = Object.values(L.open).reduce((total, count) => total + count, 0);

  return (
    <section aria-labelledby="continue-heading" className="rounded-2xl border border-line-strong bg-subtle p-6 sm:p-7">
      <p className="text-[12px] font-medium text-muted">Pick up where you left off</p>
      <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="continue-heading" className="text-2xl font-semibold tracking-tight">{L.name}</h2>
          <p className="mt-2 text-[15px] font-medium">{openTotal} findings need review</p>
          <p className="mt-1 text-[13px] text-muted">{L.documents} documents · Last worked {L.lastWorked}</p>
        </div>
        <Link href="/review" className="group inline-flex w-fit shrink-0 items-center gap-3 rounded-md bg-fg px-4 py-3 text-[13.5px] font-medium text-bg transition hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fg">
          Continue reviewing
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 text-[12px] text-muted">
        <span>{L.reviewed} of {L.total} findings reviewed</span>
        <span>{L.open.bias} bias · {L.open.misinformation} misinformation · {L.open.disinformation} disinformation</span>
      </div>
    </section>
  );
}
