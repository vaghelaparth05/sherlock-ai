"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { InvestigationDashboard } from "@/components/investigation-dashboard";

function subscribe() { return () => {}; }
function snapshot() {
  try { return sessionStorage.getItem("sherlock-investigation"); }
  catch { return null; }
}
function serverSnapshot() { return null; }

export function InvestigationView() {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const context = useMemo(() => {
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      if (typeof value.collection !== "string" || !Array.isArray(value.documents) || !value.documents.length) return null;
      if (!value.documents.every((doc: { name?: unknown }) => doc && typeof doc.name === "string")) return null;
      return { collection: value.collection as string, names: value.documents.map((doc: { name: string }) => doc.name) as string[] };
    } catch { return null; }
  }, [raw]);

  if (!context) return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Start with your documents</h1>
      <p className="text-sm text-muted">Upload files or choose the sample collection to open an investigation.</p>
      <Link href="/import" className="rounded-lg bg-accent px-5 py-3 text-sm text-white">Import documents</Link>
    </main>
  );

  return <InvestigationDashboard collection={context.collection} documentNames={context.names} />;
}
