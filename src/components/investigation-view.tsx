"use client";

import Link from "next/link";
import { InvestigationDashboard } from "@/components/investigation-dashboard";
import { useLive, useRequireUser } from "@/components/live-provider";

/** Step 2: the live investigation of whatever is in the register. */
export function InvestigationView() {
  useRequireUser("information_manager");
  const { results, loaded } = useLive();

  if (!loaded) return <main className="grid min-h-screen place-items-center text-sm text-muted">Loading the investigation…</main>;
  if (!results.docs.length) return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Start with your documents</h1>
      <p className="text-sm text-muted">Upload files or choose the sample collection to open an investigation.</p>
      <Link href="/import" className="rounded-lg bg-accent px-5 py-3 text-sm text-white">Import documents</Link>
    </main>
  );

  return <InvestigationDashboard collection={results.collection.name} documentNames={results.docs.map((d) => `${d.id} · ${d.title}`)} />;
}
