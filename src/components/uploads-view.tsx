"use client";

import { useState } from "react";
import { AlertTriangle, Check, Inbox, ShieldAlert, X } from "lucide-react";
import clsx from "clsx";
import { TopNav } from "@/components/top-nav";
import { Reveal } from "@/components/reveal";
import { BandBadge, GateBadge } from "@/components/risk-badge";
import { postJson, useApi, useRequireUser } from "@/components/live-provider";
import type { RegisterRow } from "@/lib/register";
import type { dataCard } from "@/lib/card";

type Card = NonNullable<ReturnType<typeof dataCard>>;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");

/** The information manager's queue of staff uploads, each with its data card. */
export function UploadsView() {
  const user = useRequireUser("information_manager");
  const { data } = useApi<{ awaiting: RegisterRow[]; decided: RegisterRow[] }>(user ? "/api/submissions" : null);
  const [picked, setPicked] = useState<string | null>(null);
  const awaiting = data?.awaiting ?? [];
  const decided = data?.decided ?? [];
  const selected = picked ?? awaiting[0]?.id ?? decided[0]?.id ?? null;

  return (
    <div className="relative min-h-screen">
      <TopNav current="uploads" />
      <main className="mx-auto max-w-6xl px-5 pb-24 pt-10">
        <Reveal>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Uploads to review</h1>
          <p className="mt-2 max-w-2xl text-[14px] text-muted">
            Records staff have submitted. Sherlock has already scored each one. Nothing reaches the assistant until you approve it.
          </p>
        </Reveal>

        <div className="mt-8 grid gap-5 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-4">
            <Queue title={`Waiting (${awaiting.length})`} rows={awaiting} selected={selected} onPick={setPicked} empty="Nothing waiting. New uploads appear here as they arrive." />
            {decided.length > 0 && <Queue title="Decided" rows={decided} selected={selected} onPick={setPicked} empty="" />}
          </aside>
          <section className="min-w-0">
            {selected ? <DataCard id={selected} /> : (
              <div className="grid place-items-center rounded-xl border border-dashed border-line-strong bg-subtle px-6 py-16 text-center text-muted">
                <Inbox className="size-6 text-faint" />
                <p className="mt-3 text-[14px]">{data ? "No uploads yet." : "Loading…"}</p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Queue({ title, rows, selected, onPick, empty }: { title: string; rows: RegisterRow[]; selected: string | null; onPick: (id: string) => void; empty: string }) {
  return (
    <div>
      <p className="mb-2 text-[12px] font-medium text-muted">{title}</p>
      {rows.length ? (
        <ul className="overflow-hidden rounded-xl border border-line bg-subtle">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => onPick(r.id)} className={clsx("w-full border-b border-line px-3.5 py-3 text-left transition last:border-b-0 hover:bg-hover", selected === r.id && "bg-elevated")}>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium">{r.title}</span>
                  <BandBadge band={r.band} />
                </span>
                <span className="mt-0.5 block text-[11.5px] text-faint">
                  {r.id} · {r.submittedBy} · {when(r.submittedAt)}{r.review !== "awaiting" ? ` · ${r.review}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        empty && <p className="rounded-xl border border-line bg-subtle px-3.5 py-4 text-[12.5px] text-faint">{empty}</p>
      )}
    </div>
  );
}

function DataCard({ id }: { id: string }) {
  const { data: card, reload } = useApi<Card>(`/api/register/${id}/card`);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!card) return <p className="text-muted">Loading the data card…</p>;
  const blocked = card.gate?.status === "blocked";
  const decided = card.review.status === "approved" || card.review.status === "rejected";

  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    setError("");
    try {
      await postJson(`/api/register/${id}/review`, { decision, reason });
      setReason("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record the decision.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl border border-line-strong bg-subtle">
      <header className="border-b border-line p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] text-faint">{card.document.id}</span>
          <BandBadge band={card.risk.band} risk={card.risk.risk} />
          {card.gate && <GateBadge gate={card.gate.status} />}
          <span className="text-[12px] text-muted">· review {card.review.status.replace("_", " ")}</span>
        </div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">{card.document.title}</h2>
        <p className="mt-1 text-[12.5px] text-muted">
          {card.document.unit === "unknown" ? "Unknown creator" : card.document.unit} · {card.document.function.replace(/_/g, " ")} · {card.document.custody.join(" › ")} · {card.document.recordStatus} · {card.document.date}
        </p>
        <p className="mt-1 text-[11.5px] text-faint">Submitted by {card.review.submittedBy} · text from {card.document.textMethod}</p>
      </header>

      <div className="grid gap-5 p-5 lg:grid-cols-[220px_1fr]">
        <div>
          <p className="text-[12px] text-muted">Trust score</p>
          <p className="text-5xl font-semibold tracking-tight tabular-nums">{card.trust ?? "–"}</p>
          <p className="mt-1 text-[12px] text-muted">
            Likelihood {card.risk.likelihood ?? "–"} × consequence {card.risk.consequence ?? "–"} = {card.risk.risk ?? "–"}
          </p>
          <div className={clsx("mt-4 rounded-lg border p-3 text-[12px]", card.recommendation.action === "approve" ? "border-success/30 bg-success-soft text-success" : card.recommendation.action === "reject" ? "border-danger/40 bg-danger-soft text-danger" : "border-warning/40 bg-warning-soft text-warning")}>
            <p className="font-semibold capitalize">Sherlock suggests: {card.recommendation.action}</p>
            <p className="mt-1 leading-relaxed">{card.recommendation.why}</p>
          </div>
        </div>

        <div className="space-y-4 text-[12.5px]">
          {card.explain && (
            <Section title="Why this score">
              <ul className="space-y-1 text-muted">
                <li><b className="text-fg">Provenance</b> {card.explain.provenance}</li>
                <li><b className="text-fg">Currency</b> {card.explain.currency}</li>
                <li><b className="text-fg">Corroboration</b> {card.explain.corroboration}</li>
                <li><b className="text-fg">Integrity</b> {card.explain.integrity}</li>
              </ul>
            </Section>
          )}
          {card.disinformation.length > 0 && (
            <Section title="Disinformation signals" icon={<ShieldAlert className="size-4 text-danger" />}>
              <ul className="space-y-1">{card.disinformation.map((d) => <li key={d.signal}><b>{d.signal}.</b> <span className="text-muted">{d.detail}</span></li>)}</ul>
            </Section>
          )}
          {card.misinformation.length > 0 && (
            <Section title="Misinformation" icon={<AlertTriangle className="size-4 text-warning" />}>
              <ul className="space-y-1.5">{card.misinformation.map((m) => <li key={m.claimId}><span className="font-medium capitalize">{m.status}:</span> “{m.quote}” <span className="text-faint">{m.location}{m.replacedBy ? ` · replaced by ${m.replacedBy}` : ""}</span></li>)}</ul>
            </Section>
          )}
          {card.bias.length > 0 && (
            <Section title="Representation if approved">
              <ul className="space-y-1">{card.bias.map((b) => <li key={b.subject}><b>{b.label}</b>: {b.now} → {b.ifApproved}{b.now !== b.ifApproved ? "" : " (no change)"}</li>)}</ul>
            </Section>
          )}
          {card.impact.proposals.length > 0 && (
            <Section title="What it affects">
              <ul className="space-y-1">
                {card.impact.proposals.map((p) => (
                  <li key={p.relationship.id} className="text-muted">
                    <b className="text-fg">{p.type.replace("_", " ")}</b> {p.to.documentId} ({Math.round(p.relationship.confidence * 100)}%): {p.relationship.rationale}
                    {p.recall.length > 0 && <span className="text-danger"> Would recall {p.recall.map((r) => r.answerId).join(", ")}.</span>}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section title={`Claims (${card.claims.length})`}>
            <ul className="space-y-1.5">{card.claims.map((c) => <li key={c.id}>“{c.quote}” <span className="text-faint">· {c.status}{c.contradictedBy.length ? ", contradicted" : ""}</span></li>)}</ul>
          </Section>
        </div>
      </div>

      <footer className="border-t border-line p-5">
        {decided ? (
          <p className="text-[12.5px] text-muted">
            {card.review.status === "approved" ? "Approved" : "Rejected"} by {card.review.decidedBy}{card.review.decisionReason ? `: “${card.review.decisionReason}”` : ""}. {card.aiReadable ? "The assistant can read it." : "The assistant cannot read it."}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="text-[12px] font-medium">
              Reason {blocked ? <span className="text-danger">required: approving overrides the gate</span> : <span className="text-faint">(recorded in the ledger)</span>}
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why are you approving or rejecting this record?" className="mt-1.5 w-full rounded-lg border border-line-strong bg-bg px-3 py-2 text-[12.5px] outline-none focus:border-accent" />
            </label>
            <div className="flex gap-2">
              <button type="button" disabled={busy || card.gate?.status === "quarantined"} onClick={() => decide("approve")} className="inline-flex items-center gap-1.5 rounded-lg border border-success/30 bg-success-soft px-4 py-2.5 text-[13px] font-semibold text-success disabled:opacity-40">
                <Check className="size-4" /> {blocked ? "Approve with override" : "Approve for the assistant"}
              </button>
              <button type="button" disabled={busy} onClick={() => decide("reject")} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-4 py-2.5 text-[13px] font-semibold text-muted hover:text-fg disabled:opacity-40">
                <X className="size-4" /> Reject
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
      </footer>
    </article>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-faint">{icon}{title}</h3>
      {children}
    </section>
  );
}
