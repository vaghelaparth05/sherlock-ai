"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { FolderInput, LoaderCircle, TriangleAlert } from "lucide-react";
import { postJson } from "@/lib/client";

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-64 animate-pulse rounded-md bg-elevated" />
      <div className="h-4 w-96 max-w-full animate-pulse rounded bg-elevated" />
      <div className="grid gap-3 pt-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-subtle" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-subtle" />
      ))}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-danger/40 bg-danger-soft p-5">
      <p className="flex items-center gap-2 text-[14px] font-medium text-danger">
        <TriangleAlert className="size-4" />
        Something went wrong
      </p>
      <p className="mt-1.5 text-[13px] text-muted">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 rounded-md border border-line-strong px-3 py-1.5 text-[12.5px] transition hover:bg-hover">
          Try again
        </button>
      )}
    </motion.div>
  );
}

/** Shown on any results-based screen when nothing has been scanned yet. */
export function NoScans() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function trySample(set: "naa" | "corpus") {
    setBusy(true);
    setError("");
    try {
      const s = await postJson<{ id: string }>(`/api/samples/${set}`, {});
      const scan = await postJson<{ id: string }>("/api/scans", { collectionId: s.id });
      router.push(`/scan?scan=${scan.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-md rounded-2xl border border-dashed border-line-strong bg-subtle px-8 py-12 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-full border border-line-strong bg-elevated">
        <FolderInput className="size-5 text-muted" />
      </span>
      <h2 className="mt-4 text-lg font-semibold tracking-tight">Nothing scanned yet</h2>
      <p className="mt-1.5 text-[13.5px] text-muted">Import a collection of documents and Sherlock will find out where each claim came from and what it affects.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/import" className="rounded-md bg-fg px-4 py-2 text-[13px] font-medium text-bg transition hover:bg-white active:scale-[0.97]">
          Import documents
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => trySample("naa")}
          className="inline-flex items-center gap-2 rounded-md border border-line-strong px-4 py-2 text-[13px] transition hover:bg-hover active:scale-[0.97] disabled:opacity-60"
        >
          {busy && <LoaderCircle className="size-3.5 animate-spin" />}
          Scan the NAA sample
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => trySample("corpus")}
          className="inline-flex items-center gap-2 rounded-md border border-line-strong px-4 py-2 text-[13px] transition hover:bg-hover active:scale-[0.97] disabled:opacity-60"
        >
          Scan the grant corpus
        </button>
      </div>
      {error && <p className="mt-4 text-[12.5px] text-danger">{error}</p>}
    </motion.div>
  );
}
