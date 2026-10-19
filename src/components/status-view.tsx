"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock3, FileText, Search } from "lucide-react";
import { formatBytes } from "@/lib/format";
import { logoutAction } from "@/app/actions/auth";

interface ServerDoc {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
}

const REVIEW_DAYS = 2;

export function StatusView() {
  const [docs, setDocs] = useState<ServerDoc[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/documents")
      .then((r) => r.json())
      .then((data: { documents: ServerDoc[] }) => !cancelled && setDocs(data.documents))
      .catch(() => !cancelled && setDocs([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const earliest = docs?.length ? docs.reduce((a, b) => (a.uploadedAt < b.uploadedAt ? a : b)).uploadedAt : null;
  const eta = new Date((earliest ? new Date(earliest).getTime() : Date.now()) + REVIEW_DAYS * 86_400_000);

  return (
    <div className="min-h-screen">
      <header className="relative mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-md border border-line-strong bg-elevated">
            <Search className="size-3.5 text-fg" strokeWidth={2.25} />
          </span>
          <span className="text-sm font-semibold tracking-tight">Sherlock.ai</span>
        </Link>
        <form action={logoutAction}>
          <button type="submit" className="text-[13px] text-faint transition hover:text-fg">
            Log out
          </button>
        </form>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24 pt-6">
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-subtle px-2.5 py-1 text-[12px] text-muted">
          <span className="breathe size-1.5 rounded-full" style={{ background: "var(--warning)" }} />
          Review in progress
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your documents are under review</h1>
        <p className="mt-2 max-w-xl text-[15px] text-muted">
          Sherlock is investigating what you uploaded — checking each claim against its sources and looking for
          contradictions. An information manager confirms every finding before anything is final.
        </p>

        <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-line bg-subtle px-4 py-3 text-[13.5px]">
          <Clock3 className="size-4 shrink-0 text-muted" />
          <span>
            Usually takes up to {REVIEW_DAYS} days. Expected by{" "}
            <strong className="font-semibold">
              {eta.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            </strong>
            . We&rsquo;ll show results here once it&rsquo;s done — no need to re-upload.
          </span>
        </div>

        <div className="mt-8">
          <h2 className="mb-2 text-[13px] font-medium text-muted">
            {docs === null ? "Loading…" : `${docs.length} document${docs.length === 1 ? "" : "s"} submitted`}
          </h2>

          {docs && docs.length === 0 ? (
            <p className="rounded-xl border border-line bg-subtle px-5 py-8 text-center text-[13px] text-faint">
              Nothing submitted yet.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-xl border border-line bg-subtle">
              {docs?.map((d) => (
                <li key={d.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                  <FileText className="size-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px]">{d.name}</p>
                    <p className="text-[12px] text-faint">{formatBytes(d.size)}</p>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{ color: "var(--warning)", background: "rgba(245, 166, 35, 0.14)" }}
                  >
                    Pending review
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
