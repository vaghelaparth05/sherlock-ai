"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  Archive,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpenCheck,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  ExternalLink,
  FileCheck2,
  FileText,
  Fingerprint,
  Globe2,
  Layers3,
  LockKeyhole,
  MessageSquareText,
  MoreHorizontal,
  Network,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  SquareArrowOutUpRight,
  Upload,
  Waypoints,
} from "lucide-react";
import clsx from "clsx";
import { AppearanceToggle } from "@/components/appearance-toggle";
import { postJson, useApi, useDashboard, useLive } from "@/components/live-provider";
import type { Finding } from "@/lib/findings";
import type { RegisterRow } from "@/lib/register";

type Signal = "Conflict" | "Potential bias" | "Needs context";

interface Claim {
  id: string;
  title: string;
  excerpt: string;
  signal: Signal;
  confidence: number;
  sources: number;
  updated: string;
  color: "rose" | "amber" | "violet";
}

interface Signal_ extends Claim {
  finding: Finding;
}

const STATUS_ORDER = { open: 0, confirmed: 1, dismissed: 2 } as const;
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

/** Live findings as the claim rows this screen shows, open first. */
function toSignals(findings: Finding[]): Signal_[] {
  return [...findings]
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.confidence - a.confidence)
    .map((f) => {
      const signal: Signal = f.type === "bias" ? "Potential bias" : f.kind === "unsourced" || f.kind === "single-source" ? "Needs context" : "Conflict";
      return {
        id: f.id,
        title: f.title,
        excerpt: f.summary,
        signal,
        confidence: f.confidence,
        sources: f.docIds.length,
        updated: f.status === "open" ? "Open" : f.status === "confirmed" ? "Confirmed" : "Dismissed",
        color: signal === "Conflict" ? "rose" : signal === "Potential bias" ? "amber" : "violet",
        finding: f,
      };
    });
}

/** [[decisive words]] in a quote, shown as marks. */
function marked(quote: string): ReactNode[] {
  return quote.split(/(\[\[[^\]]+\]\])/).map((part, i) => (part.startsWith("[[") ? <mark key={i}>{part.slice(2, -2)}</mark> : part));
}

const filters = ["All signals", "Conflicts", "Potential bias", "Needs context"] as const;
type Filter = (typeof filters)[number];

const signalStyles: Record<Signal, string> = {
  Conflict: "signal-rose",
  "Potential bias": "signal-amber",
  "Needs context": "signal-violet",
};

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <Waypoints size={19} strokeWidth={1.9} />
    </div>
  );
}

export function InvestigationDashboard({ collection, documentNames }: { collection: string; documentNames: string[] }) {
  const router = useRouter();
  const { results, user } = useLive();
  const dash = useDashboard();
  const register = useApi<{ documents: RegisterRow[] }>(user?.role === "information_manager" ? "/api/register" : null);
  const claims = useMemo(() => toSignals(results.findings), [results.findings]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedClaim = claims.find((c) => c.id === selectedId) ?? claims[0];
  const setSelectedClaim = (c: Signal_) => setSelectedId(c.id);
  const [filter, setFilter] = useState<Filter>("All signals");
  const [query, setQuery] = useState("");
  const [activeNav, setActiveNav] = useState("Overview");
  const [verified, setVerified] = useState<{ at: string; text: string } | null>(null);
  const open = claims.filter((c) => c.finding.status === "open");
  const rows = register.data?.documents ?? [];
  const readable = rows.filter((r) => r.aiReadable && r.trust !== null);
  const avgTrust = readable.length ? Math.round(readable.reduce((n, r) => n + (r.trust ?? 0), 0) / readable.length) : null;
  const sources = [...dash.sourceWatch]
    .map((w) => ({ ...w, total: w.corroborated + w.review + w.superseded + w.single, checked: w.corroborated + w.review + w.superseded }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  async function verify() {
    try {
      const r = await postJson<{ documents: number; mismatched: { id: string }[]; chain: { ok: boolean } }>("/api/register/verify", {});
      setVerified({
        at: new Date().toLocaleTimeString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" }),
        text: r.mismatched.length ? `${r.mismatched.map((m) => m.id).join(", ")} changed` : `${r.documents} / ${r.documents}`,
      });
      register.reload();
    } catch (e) {
      setVerified({ at: "now", text: e instanceof Error ? e.message : "Verify failed" });
    }
  }

  const visibleClaims = useMemo(() => {
    const needle = query.toLowerCase().trim();
    return claims.filter((claim) => {
      const matchesFilter =
        filter === "All signals" ||
        (filter === "Conflicts" && claim.signal === "Conflict") ||
        (filter === "Potential bias" && claim.signal === "Potential bias") ||
        (filter === "Needs context" && claim.signal === "Needs context");
      return matchesFilter && (!needle || `${claim.title} ${claim.id} ${claim.signal}`.toLowerCase().includes(needle));
    });
  }, [filter, query, claims]);

  function markReviewed() {
    router.push("/review");
  }

  return (
    <div className="sherlock-shell">
      <aside className="sherlock-sidebar">
        <div className="brand-lockup">
          <BrandMark />
          <span>Sherlock<span className="brand-dot">.</span></span>
          <span className="brand-ai">AI</span>
        </div>

        <button className="workspace-switcher" type="button">
          <span className="workspace-avatar">N</span>
          <span className="workspace-copy"><strong>NAA workspace</strong><small>National Archives</small></span>
          <ChevronDown size={15} />
        </button>

        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Workspace">
          {[
            { label: "Overview", icon: Layers3 },
            { label: "Collections", icon: Archive, count: rows.length ? "01" : "00" },
            { label: "Claims", icon: MessageSquareText, count: String(open.length).padStart(2, "0") },
            { label: "Sources", icon: Globe2 },
            { label: "Activity", icon: Activity },
          ].map(({ label, icon: Icon, count }) => (
            <button key={label} type="button" onClick={() => setActiveNav(label)} className={clsx("side-nav-item", activeNav === label && "is-active")}>
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
              {count && <span className="nav-count">{count}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-section-label sidebar-collection-label">RECENT COLLECTIONS <button type="button" aria-label="More collection options"><MoreHorizontal size={16} /></button></div>
        <button className="collection-link selected" type="button" onClick={() => setActiveNav(collection)}>
          <span className="collection-color-dot dot-blue" />
          <span>{collection}</span>
          <span className="collection-doc-count">{documentNames.length}</span>
        </button>

        <div className="sidebar-bottom">
          <div className="privacy-card">
            <div className="privacy-card-icon"><LockKeyhole size={15} /></div>
            <div><strong>Archive is read-only</strong><p>Original records stay untouched.</p></div>
            <span className="privacy-live-dot" />
          </div>
          <button className="profile-button" type="button">
            <span className="profile-avatar">{(user?.name ?? "?").slice(0, 2).toUpperCase()}</span>
            <span className="workspace-copy"><strong>{user?.name ?? "Not signed in"}</strong><small>{user?.role === "information_manager" ? "Information manager" : "Contributor"}</small></span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>

      <main className="sherlock-main">
        <header className="dashboard-topbar">
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{activeNav === "Overview" ? "Overview" : activeNav}</strong></div>
          <div className="topbar-actions">
            <div className="system-status"><span className="status-dot" /> Live analysis</div>
            <AppearanceToggle />
            <button type="button" className="icon-button" aria-label="Notifications"><Bell size={17} /><i /></button>
            <button type="button" className="help-button"><CircleHelp size={16} /><span>Help</span></button>
          </div>
        </header>

        <div className="dashboard-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-pulse" /> STEP 2 · INVESTIGATE DOCUMENTS</div>
              <h1>Follow the evidence<span className="heading-sparkle">✳</span></h1>
              <p>Identify sources, examine supporting evidence, and review potential misinformation and bias.</p>
            </div>
            <div className="heading-actions">
              <span className="collection-select"><span className="collection-color-dot dot-blue" /> {collection}</span>
              <Link href="/import" className="add-documents-button"><Upload size={14} /> Add documents</Link>
            </div>
          </section>

          <section className="investigation-context surface-card">
            <div><strong>{documentNames.length} document{documentNames.length === 1 ? "" : "s"} ready for investigation</strong><p>Sherlock has fingerprinted every original, read its claims, traced each claim to its origin and checked it against the other records. The findings below are live and update as records arrive.</p></div>
            <details><summary>View imported documents</summary><ul>{documentNames.map((name, index) => <li key={`${index}-${name}`}><FileText size={13} />{name}</li>)}</ul></details>
          </section>

          <section className="metrics-grid" aria-label="Collection summary">
            <MetricCard label="Documents received" value={String(documentNames.length)} detail={collection} icon={FileCheck2} tone="blue" trend={`${readable.length} readable by the assistant`} />
            <MetricCard label="Claims identified" value={String(results.claims.length)} detail="Distinct claims, copies counted once" icon={MessageSquareText} tone="violet" trend="View claim map" />
            <MetricCard label="Need a closer look" value={String(open.length)} detail="Conflicts, context & bias signals" icon={Search} tone="amber" trend={`${open.filter((c) => c.finding.severity === "high").length} high priority`} />
            <MetricCard label="Average trust" value={avgTrust === null ? "–" : String(avgTrust)} detail="Across records the assistant can read" icon={ShieldCheck} tone="green" trend={`${rows.filter((r) => r.gate === "blocked").length} records blocked`} />
          </section>

          <section className="analysis-banner">
            <div className="analysis-icon"><Sparkles size={17} /></div>
            <div className="analysis-banner-copy">
              <strong>Analysis complete · {results.claims.length} claims traced across {documentNames.length} records</strong>
              <span>Origins traced and copies counted once, conflicts classified and checked against declared records. {open.length} finding{open.length === 1 ? "" : "s"} need{open.length === 1 ? "s" : ""} your decision.</span>
            </div>
            <div className="branch-pills"><span><Archive size={13} /> {documentNames.length} records</span><span><Fingerprint size={13} /> {rows.length} fingerprinted</span><span><Network size={13} /> {claims.filter((c) => c.finding.type === "bias").length} bias signals</span></div>
            <Link href="/results" className="banner-link">See findings <ArrowRight size={15} /></Link>
          </section>

          <div className="dashboard-columns">
            <section className="claims-panel surface-card">
              <div className="panel-heading">
                <div><div className="section-title-line"><h2>Claims to review</h2><span className="count-badge">{open.length}</span></div><p>Potential conflicts and signals found in your documents</p></div>
                <button type="button" className="text-action">See all <ArrowRight size={14} /></button>
              </div>

              <div className="claims-toolbar">
                <div className="filter-tabs" role="tablist" aria-label="Filter claims">
                  {filters.map((item) => <button key={item} role="tab" aria-selected={filter === item} className={clsx("filter-tab", filter === item && "selected")} onClick={() => setFilter(item)}>{item}{item === "All signals" && <span>{claims.length}</span>}</button>)}
                </div>
                <label className="claim-search"><Search size={15} /><input aria-label="Search claims" placeholder="Search claims" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd><Command size={10} /> K</kbd></label>
                <button type="button" className="filter-button" aria-label="More filters"><SlidersHorizontal size={15} /></button>
              </div>

              <div className="claim-list">
                {visibleClaims.map((claim) => <button type="button" key={claim.id} onClick={() => setSelectedClaim(claim)} className={clsx("claim-row", selectedClaim?.id === claim.id && "claim-selected")}>
                  <span className={clsx("claim-signal-icon", signalStyles[claim.signal])}>{claim.signal === "Conflict" ? <ArrowDownRight size={15} /> : claim.signal === "Potential bias" ? <SlidersHorizontal size={14} /> : <CircleHelp size={15} />}</span>
                  <span className="claim-row-content"><span className="claim-row-top"><strong>{claim.title}</strong><span className={clsx("signal-pill", signalStyles[claim.signal])}>{claim.signal}</span></span><span className="claim-row-meta"><span>{claim.id}</span><i />{claim.sources} sources<i /><Clock3 size={12} />{claim.updated}</span></span>
                  <span className="claim-confidence"><span>{claim.confidence}%</span><small>confidence</small></span>
                  <ChevronRight className="claim-chevron" size={16} />
                </button>)}
                {visibleClaims.length === 0 && <div className="empty-claims"><Search size={18} /><span>No claims match this search.</span></div>}
              </div>
              <Link href="/results" className="load-more">Show all {claims.length} signals <ArrowRight size={14} /></Link>
            </section>

            {!selectedClaim ? (
              <aside className="claim-detail surface-card"><p className="detail-summary">{results.findings.length || register.data ? "No findings in this collection." : "Loading findings…"}</p></aside>
            ) : (
            <aside className="claim-detail surface-card">
              <div className="detail-topline"><span className="detail-kicker">CLAIM DETAIL</span><button type="button" className="subtle-icon-button" aria-label="More claim options"><MoreHorizontal size={18} /></button></div>
              <div className="detail-status"><span className={clsx("signal-pill", signalStyles[selectedClaim.signal])}><span className="tiny-signal-dot" />{selectedClaim.signal}</span><span className="detail-id">{selectedClaim.id}</span></div>
              <h2>{selectedClaim.title}</h2>
              <p className="detail-summary">{selectedClaim.excerpt}</p>

              <div className="confidence-block">
                <div className="confidence-heading"><span>Evidence confidence</span><strong>{selectedClaim.confidence}<small>%</small></strong></div>
                <div className="confidence-track"><span style={{ width: `${selectedClaim.confidence}%` }} /></div>
                <div className="confidence-foot"><span>Based on {selectedClaim.sources} linked records</span><button type="button">How is this scored?</button></div>
              </div>

              <div className="evidence-heading"><h3>Evidence trail</h3><button type="button">{selectedClaim.sources} sources <ChevronRight size={13} /></button></div>
              {selectedClaim.finding.evidence.map((e, n) => {
                const doc = results.docs.find((d) => d.id === e.docId);
                return (
                  <div key={`${e.docId ?? "x"}-${n}`} className={clsx("evidence-card", n === 0 ? "evidence-support" : "evidence-conflict")}>
                    <div className="evidence-card-head"><span className="evidence-label">{n === 0 ? <Check size={12} /> : <ArrowDownRight size={12} />} {e.label.toUpperCase()}</span><span className="evidence-match">{doc ? `${doc.source} · ${doc.year}` : ""}</span></div>
                    <p className={e.mono ? "font-mono" : undefined}>{e.mono ? e.quote : <>“{marked(e.quote)}”</>}</p>
                    {doc && <Link href="/register" className="evidence-source"><span className="file-mini-icon"><FileText size={14} /></span><span><strong>{doc.title}</strong><small>{doc.id}</small></span><ExternalLink size={13} /></Link>}
                  </div>
                );
              })}

              <div className="research-branches">
                <div className="branches-heading"><span><Waypoints size={14} /> Evidence trail</span><Link href="/results">Details <ArrowUpRight size={12} /></Link></div>
                <div className="branch-row"><span className="branch-node branch-node-archive"><Archive size={12} /></span><span><strong>Archive corpus</strong><small>{selectedClaim.finding.docIds.length} linked documents</small></span><span className="branch-state">Matched</span></div>
                <div className="branch-row"><span className="branch-node branch-node-web"><Network size={12} /></span><span><strong>Claim lineage</strong><small>{selectedClaim.finding.claimIds.length} related claims, origin traced</small></span><span className="branch-state branch-state-neutral">Traced</span></div>
                <div className="branch-row"><span className="branch-node branch-node-bias"><Fingerprint size={12} /></span><span><strong>Your decision</strong><small>{selectedClaim.finding.history?.at(-1)?.note ?? "Not reviewed yet"}</small></span><span className={clsx("branch-state", selectedClaim.finding.status === "open" ? "branch-state-warning" : "branch-state-neutral")}>{selectedClaim.updated}</span></div>
              </div>

              <div className="detail-actions">
                <button type="button" className="review-button" onClick={markReviewed}>
                  <BookOpenCheck size={15} /> {selectedClaim.finding.status === "open" ? "Review this finding" : "See the decision"}
                </button>
                <Link href="/register" className="open-record-button"><SquareArrowOutUpRight size={14} /> Open in the register</Link>
              </div>
              <p className="read-only-note"><LockKeyhole size={12} /> Sherlock can suggest changes. It never edits archival records.</p>
            </aside>
            )}
          </div>

          <section className="bottom-grid">
            <div className="source-card surface-card">
              <div className="panel-heading compact"><div><div className="section-title-line"><h2>Source reliability</h2><span className="info-dot">i</span></div><p>Observed track record across reviewed claims</p></div><button type="button" className="text-action">All sources <ArrowRight size={14} /></button></div>
              <div className="source-table">
                <div className="source-table-head"><span>SOURCE</span><span>RELIABILITY</span><span>LAST SEEN</span><span>LINKED CLAIMS</span></div>
                {sources.map((w, n) => (
                  <SourceRow
                    key={w.name}
                    initials={w.name.split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase()}
                    name={w.name}
                    type={w.note}
                    score={w.checked ? `${Math.round((w.corroborated / w.checked) * 100)}%` : "–"}
                    width={w.checked ? `${Math.round((w.corroborated / w.checked) * 100)}%` : "0%"}
                    date={dash.lastInvestigation.lastWorked}
                    claims={String(w.total)}
                    tone={["blue", "green", "amber"][n]}
                  />
                ))}
              </div>
            </div>
            <div className="integrity-card surface-card">
              <div className="integrity-heading"><span className="integrity-icon"><Fingerprint size={17} /></span><span><strong>Archive integrity</strong><small>Connected and protected</small></span><span className="integrity-check"><Check size={13} /></span></div>
              <div className="integrity-divider" />
              <div className="integrity-item"><span>Connection</span><strong><span className="status-dot" /> Read-only source</strong></div>
              <div className="integrity-item"><span>Files fingerprinted</span><strong>{verified?.text ?? `${rows.length} / ${rows.length}`} <span className="integrity-ok"><Check size={11} /></span></strong></div>
              <div className="integrity-item"><span>Latest verification</span><strong>{verified ? `Today, ${verified.at}` : "Not run this session"}</strong></div>
              <button type="button" className="integrity-link" onClick={verify}>Verify now <ArrowRight size={13} /></button>
            </div>
          </section>

          <footer className="dashboard-footer"><span><LockKeyhole size={12} /> Private workspace · Analysis is stored securely</span><span>Last synced today at 9:42 am</span></footer>
        </div>
      </main>

    </div>
  );
}

function MetricCard({ label, value, detail, icon: Icon, tone, trend }: { label: string; value: string; detail: string; icon: typeof FileText; tone: string; trend: string }) {
  return <div className="metric-card surface-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon metric-${tone}`}><Icon size={16} strokeWidth={1.8} /></span></div><div className="metric-value">{value}</div><div className="metric-detail">{detail}</div><div className="metric-trend"><span className={`trend-mark ${tone === "amber" ? "trend-amber" : ""}`}>{tone === "amber" ? <ArrowUpRight size={12} /> : <ArrowUpRight size={12} />}</span>{trend}</div></div>;
}

function SourceRow({ initials, name, type, score, width, date, claims: linkedClaims, tone }: { initials: string; name: string; type: string; score: string; width: string; date: string; claims: string; tone: string }) {
  return <div className="source-row"><div className="source-name-cell"><span className={`source-avatar source-${tone}`}>{initials}</span><span><strong>{name}</strong><small>{type}</small></span></div><div className="source-reliability"><strong>{score}</strong><span className="source-progress"><i style={{ width }} /></span></div><span className="source-last-seen">{date}</span><button type="button" className="linked-claims">{linkedClaims} claims <ChevronRight size={13} /></button></div>;
}
