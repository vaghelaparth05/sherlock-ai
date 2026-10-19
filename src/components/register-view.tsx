"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Fingerprint, ShieldCheck } from "lucide-react";
import clsx from "clsx";
import { TopNav } from "@/components/top-nav";
import { Reveal } from "@/components/reveal";
import { BandBadge, GateBadge } from "@/components/risk-badge";
import { postJson, useApi, useRequireUser } from "@/components/live-provider";
import type { RegisterRow, documentDetail } from "@/lib/register";

type Detail = NonNullable<ReturnType<typeof documentDetail>>;
type Filter = "all" | "blocked" | "readable" | "outside";

const LIKELIHOOD = ["Rare", "Unlikely", "Possible", "Likely", "Almost certain"];
const CELL = (risk: number) => (risk >= 20 ? "bg-danger text-white" : risk >= 10 ? "bg-danger-soft text-danger" : risk >= 5 ? "bg-warning-soft text-warning" : "bg-success-soft text-success");

/** The AI data risk register: every record's trust, risk and gate, on the 5×5 matrix. */
export function RegisterView() {
  const user = useRequireUser("information_manager");
  const { data, reload } = useApi<{ documents: RegisterRow[] }>(user ? "/api/register" : null);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [cell, setCell] = useState<[number, number] | null>(null);
  const [verify, setVerify] = useState<string>("");
  const rows = useMemo(() => data?.documents ?? [], [data]);

  const visible = rows.filter(
    (r) =>
      (filter === "all" || (filter === "blocked" && r.gate !== "allowed") || (filter === "readable" && r.aiReadable) || (filter === "outside" && !r.inAiScope)) &&
      (!cell || (r.likelihood === cell[0] && r.consequence === cell[1])),
  );
  const count = (pred: (r: RegisterRow) => boolean) => rows.filter(pred).length;

  async function runVerify() {
    setVerify("Re-hashing every original…");
    try {
      const r = await postJson<{ documents: number; mismatched: { id: string }[]; chain: { ok: boolean; entries: number } }>("/api/register/verify", {});
      setVerify(
        `${r.mismatched.length ? `${r.mismatched.map((m) => m.id).join(", ")} changed since ingest.` : `All ${r.documents} originals match their hash.`} Ledger chain ${r.chain.ok ? `intact (${r.chain.entries} entries)` : "BROKEN"}.`,
      );
      reload();
    } catch (e) {
      setVerify(e instanceof Error ? e.message : "Verify failed.");
    }
  }

  return (
    <div className="relative min-h-screen">
      <TopNav active={4} />
      <main className="mx-auto max-w-6xl px-5 pb-24 pt-10">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">AI data risk register</h1>
            <p className="mt-2 max-w-2xl text-[14px] text-muted">
              Every record the assistant could read, scored on provenance, currency, corroboration and integrity, rated on the
              likelihood-by-consequence matrix, and gated. You decide what the AI may read.
            </p>
          </div>
          <button type="button" onClick={runVerify} className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-elevated px-3.5 py-2 text-[13px] transition hover:bg-hover">
            <Fingerprint className="size-4" /> Verify integrity
          </button>
        </Reveal>
        {verify && <p className="mt-3 rounded-md border border-line bg-elevated px-3 py-2 text-[12.5px] text-muted" aria-live="polite">{verify}</p>}

        <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_300px]">
          <section className="min-w-0">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {([
                ["all", `All ${rows.length}`],
                ["readable", `Readable by the assistant ${count((r) => r.aiReadable)}`],
                ["blocked", `Blocked or quarantined ${count((r) => r.gate !== "allowed")}`],
                ["outside", `Outside AI scope ${count((r) => !r.inAiScope)}`],
              ] as [Filter, string][]).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setFilter(id)} className={clsx("rounded-full border px-3 py-1 text-[12px] transition", filter === id ? "border-fg text-fg" : "border-line text-muted hover:text-fg")}>
                  {label}
                </button>
              ))}
              {cell && (
                <button type="button" onClick={() => setCell(null)} className="rounded-full border border-accent px-3 py-1 text-[12px] text-accent">
                  Likelihood {cell[0]} × consequence {cell[1]} ✕
                </button>
              )}
            </div>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[760px] text-left text-[12.5px]">
                <thead className="border-b border-line bg-subtle text-[11px] uppercase tracking-wide text-faint">
                  <tr>
                    <th className="px-3 py-2.5">Record</th>
                    <th className="px-3 py-2.5">Unit</th>
                    <th className="px-3 py-2.5 text-right">Trust</th>
                    <th className="px-3 py-2.5 text-center">L × C</th>
                    <th className="px-3 py-2.5">Risk</th>
                    <th className="px-3 py-2.5">Gate</th>
                    <th className="px-3 py-2.5">Assistant</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <Fragment key={r.id}>
                      <tr className="cursor-pointer border-b border-line transition hover:bg-hover" onClick={() => setOpen(open === r.id ? null : r.id)}>
                        <td className="px-3 py-2.5">
                          <span className="font-mono text-[11px] text-faint">{r.id}</span> <span className="font-medium">{r.title}</span>
                        </td>
                        <td className="px-3 py-2.5 text-muted">{r.unit === "unknown" ? "Unknown" : r.unit}</td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums">{r.trust ?? "–"}</td>
                        <td className="px-3 py-2.5 text-center tabular-nums text-muted">{r.likelihood ? `${r.likelihood} × ${r.consequence}` : "–"}</td>
                        <td className="px-3 py-2.5"><BandBadge band={r.band} risk={r.risk} /></td>
                        <td className="px-3 py-2.5"><GateBadge gate={r.gate} />{r.overridden && <span className="ml-1 text-[11px] text-faint">(override)</span>}</td>
                        <td className="px-3 py-2.5 text-[12px]">
                          {r.aiReadable ? <span className="text-success">Can read</span> : <span className="text-muted">{r.review === "awaiting" ? "Awaiting review" : r.review === "rejected" ? "Rejected" : !r.inAiScope ? "Outside scope" : "Cannot read"}</span>}
                        </td>
                        <td className="px-2"><ChevronDown className={clsx("size-4 text-faint transition", open === r.id && "rotate-180")} /></td>
                      </tr>
                      {open === r.id && (
                        <tr className="border-b border-line bg-subtle/60">
                          <td colSpan={8} className="px-4 py-4"><RowDetail id={r.id} gateReason={r.gateReason} /></td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  {!visible.length && (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-muted">{data ? "No records match." : "Loading the register…"}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-xl border border-line bg-subtle p-4">
              <p className="text-[13px] font-medium">Risk matrix</p>
              <p className="mt-0.5 text-[11.5px] text-muted">Records per cell. Click a cell to filter.</p>
              <div className="mt-3 grid grid-cols-[auto_repeat(5,1fr)] gap-1 text-[11px]">
                {[5, 4, 3, 2, 1].map((l) => (
                  <Fragment key={l}>
                    <span className="pr-1 text-right text-faint" title={LIKELIHOOD[l - 1]}>{l}</span>
                    {[1, 2, 3, 4, 5].map((c) => {
                      const n = rows.filter((r) => r.likelihood === l && r.consequence === c).length;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => n && setCell([l, c])}
                          title={`${LIKELIHOOD[l - 1]} × consequence ${c} = risk ${l * c}`}
                          className={clsx("grid aspect-square place-items-center rounded font-medium tabular-nums", CELL(l * c), !n && "opacity-35")}
                        >
                          {n || ""}
                        </button>
                      );
                    })}
                  </Fragment>
                ))}
                <span />
                {[1, 2, 3, 4, 5].map((c) => <span key={c} className="text-center text-faint">{c}</span>)}
              </div>
              <p className="mt-2 text-[11px] text-faint">Likelihood (from trust) up, consequence (from business function) across.</p>
            </div>
            <div className="rounded-xl border border-line bg-subtle p-4 text-[12px] text-muted">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-fg"><ShieldCheck className="size-4" /> Gate rules</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>Not yet scored: quarantined</li>
                <li>File changed since ingest: blocked</li>
                <li>A later declared version exists: blocked</li>
                <li>Superseded, contradicted or unsupported claim: blocked</li>
                <li>High or Extreme risk: blocked</li>
                <li>Otherwise allowed</li>
              </ol>
              <p className="mt-2">The assistant reads only records that are approved or in scope, and allowed.</p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function RowDetail({ id, gateReason }: { id: string; gateReason: string }) {
  const { data } = useApi<Detail>(`/api/register/${id}`);
  if (!data) return <p className="text-muted">Loading…</p>;
  const s = data.score;
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <div className="space-y-2 text-[12px]">
        <p className="text-muted">{gateReason}</p>
        {s && (
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
            <dt className="text-muted">Provenance (30%)</dt><dd className="tabular-nums">{s.provenance.score}</dd>
            <dt className="text-muted">Currency (30%)</dt><dd className="tabular-nums">{s.currency.score}</dd>
            <dt className="text-muted">Corroboration (25%)</dt><dd className="tabular-nums">{s.corroboration.score}</dd>
            <dt className="text-muted">Integrity (15%)</dt><dd className="tabular-nums">{s.integrity.score}</dd>
            <dt className="font-medium">Trust</dt><dd className="font-medium tabular-nums">{s.trust}</dd>
          </dl>
        )}
        <p className="text-faint">{data.custody.join(" › ")} · {data.recordStatus.replace("_", " ")} · {data.date}</p>
        <p className="break-all font-mono text-[10.5px] text-faint">SHA-256 {data.sha256}</p>
      </div>
      <ul className="space-y-2">
        {data.claims.map((c) => (
          <li key={c.id} className="rounded-lg border border-line bg-bg/70 px-3 py-2 text-[12px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10.5px] text-faint">{c.id}</span>
              <span className={clsx("rounded-full px-1.5 py-px text-[10.5px] font-medium", c.status === "current" && !c.contradictedBy.length ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
                {c.contradictedBy.length && c.status === "current" ? (c.provisional ? "contradicted (provisional)" : "contradicted") : c.status}
              </span>
              {c.echoOf && <span className="text-[10.5px] text-faint">echo of {c.echoOf}</span>}
              <span className="text-[10.5px] text-faint">{c.agreements} independent source{c.agreements === 1 ? "" : "s"} agree</span>
            </div>
            <p className="mt-1">“{c.quote}”</p>
            <p className="mt-0.5 text-[10.5px] text-faint">{c.location} · {c.model} · {c.promptVersion}</p>
          </li>
        ))}
        {!data.claims.length && <li className="text-[12px] text-muted">No claims extracted.</li>}
      </ul>
    </div>
  );
}
