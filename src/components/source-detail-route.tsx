"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SourceDetailView } from "@/components/source-detail-view";
import { sourceDetail } from "@/lib/results-derive";
import { useLive, useRequireUser } from "@/components/live-provider";

/** /sources/[slug] from live data: sources are business units, so they are known only at runtime. */
export function SourceDetailRoute() {
  useRequireUser("information_manager");
  const { slug } = useParams<{ slug: string }>();
  const { results, loaded } = useLive();
  const detail = useMemo(() => sourceDetail(results.findings, results, slug), [results, slug]);
  if (detail) return <SourceDetailView detail={detail} />;
  return (
    <main className="mx-auto grid min-h-screen max-w-md place-items-center px-5 text-center">
      <div>
        <p className="text-[14px] text-muted">{loaded ? "No source by that name in this collection." : "Loading source…"}</p>
        {loaded && <Link href="/sources" className="mt-4 inline-block text-[13px] underline underline-offset-4">All sources</Link>}
      </div>
    </main>
  );
}
