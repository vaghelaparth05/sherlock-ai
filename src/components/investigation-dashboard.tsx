"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
  X,
} from "lucide-react";
import clsx from "clsx";
import { AppearanceToggle } from "@/components/appearance-toggle";

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

const claims: Claim[] = [
  {
    id: "CLM-0248",
    title: "Annual leave carries over up to 20 days",
    excerpt: "Unused annual leave may be carried forward, up to a maximum balance of 20 days.",
    signal: "Conflict",
    confidence: 94,
    sources: 12,
    updated: "12 min ago",
    color: "rose",
  },
  {
    id: "CLM-0191",
    title: "Contractors are eligible for personal leave",
    excerpt: "All team members, including fixed-term contractors, are entitled to personal leave.",
    signal: "Potential bias",
    confidence: 82,
    sources: 8,
    updated: "38 min ago",
    color: "amber",
  },
  {
    id: "CLM-0310",
    title: "Leave requests require two weeks’ notice",
    excerpt: "Employees should submit planned leave requests at least two weeks in advance.",
    signal: "Needs context",
    confidence: 71,
    sources: 6,
    updated: "1 hr ago",
    color: "violet",
  },
  {
    id: "CLM-0164",
    title: "Public holidays do not count toward leave",
    excerpt: "A public holiday that falls during annual leave is not deducted from the employee’s balance.",
    signal: "Conflict",
    confidence: 88,
    sources: 15,
    updated: "2 hrs ago",
    color: "rose",
  },
];

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
  const [selectedClaim, setSelectedClaim] = useState(claims[0]);
  const [filter, setFilter] = useState<Filter>("All signals");
  const [query, setQuery] = useState("");
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [activeNav, setActiveNav] = useState("Overview");
  const [showNotice, setShowNotice] = useState(false);

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
  }, [filter, query]);

  function markReviewed() {
    setReviewed((current) => current.includes(selectedClaim.id) ? current : [...current, selectedClaim.id]);
    setShowNotice(true);
    window.setTimeout(() => setShowNotice(false), 2800);
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
            { label: "Collections", icon: Archive, count: "08" },
            { label: "Claims", icon: MessageSquareText, count: "24" },
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
        <button className="collection-link selected" type="button" onClick={() => setActiveNav("Staff leave policy")}>
          <span className="collection-color-dot dot-blue" />
          <span>{collection}</span>
          <span className="collection-doc-count">{documentNames.length}</span>
        </button>
        <button className="collection-link" type="button" onClick={() => setActiveNav("Records retention") }>
          <span className="collection-color-dot dot-violet" />
          <span>Records retention</span>
          <span className="collection-doc-count">64</span>
        </button>
        <button className="collection-link" type="button" onClick={() => setActiveNav("Access & privacy") }>
          <span className="collection-color-dot dot-teal" />
          <span>Access &amp; privacy</span>
          <span className="collection-doc-count">32</span>
        </button>

        <div className="sidebar-bottom">
          <div className="privacy-card">
            <div className="privacy-card-icon"><LockKeyhole size={15} /></div>
            <div><strong>Archive is read-only</strong><p>Original records stay untouched.</p></div>
            <span className="privacy-live-dot" />
          </div>
          <button className="profile-button" type="button">
            <span className="profile-avatar">AM</span>
            <span className="workspace-copy"><strong>Alex Morgan</strong><small>Information manager</small></span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>

      <main className="sherlock-main">
        <header className="dashboard-topbar">
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{activeNav === "Overview" ? "Overview" : activeNav}</strong></div>
          <div className="topbar-actions">
            <div className="system-status"><span className="status-dot" /> Demo analysis</div>
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
            <div><strong>{documentNames.length} document{documentNames.length === 1 ? "" : "s"} ready for investigation</strong><p>UI preview: the example findings below are not analysis of your files. Connect an AI and search service to identify sources, retrieve evidence, and assess misinformation and bias.</p></div>
            <details><summary>View imported documents</summary><ul>{documentNames.map((name, index) => <li key={`${index}-${name}`}><FileText size={13} />{name}</li>)}</ul></details>
          </section>

          <section className="metrics-grid" aria-label="Collection summary">
            <MetricCard label="Documents received" value={String(documentNames.length)} detail={collection} icon={FileCheck2} tone="blue" trend="Ready for analysis" />
            <MetricCard label="Claims identified" value="248" detail="Extracted from the collection" icon={MessageSquareText} tone="violet" trend="View claim map" />
            <MetricCard label="Need a closer look" value="24" detail="Conflicts, context & bias signals" icon={Search} tone="amber" trend="8 high priority" />
            <MetricCard label="Source confidence" value="86%" detail="Based on reviewed evidence" icon={ShieldCheck} tone="green" trend="+4.2% this month" />
          </section>

          <section className="analysis-banner">
            <div className="analysis-icon"><Sparkles size={17} /></div>
            <div className="analysis-banner-copy">
              <strong>Investigation preview · sources, evidence and risk signals</strong>
              <span>Example research paths: trace origins, corroborate claims, and flag potential misinformation or bias.</span>
            </div>
            <div className="branch-pills"><span><Archive size={13} /> Archive</span><span><Globe2 size={13} /> Web</span><span><Network size={13} /> Bias scan</span></div>
            <button type="button" className="banner-link" onClick={() => setSelectedClaim(claims[0])}>View run <ArrowRight size={15} /></button>
          </section>

          <div className="dashboard-columns">
            <section className="claims-panel surface-card">
              <div className="panel-heading">
                <div><div className="section-title-line"><h2>Claims to review</h2><span className="count-badge">24</span></div><p>Potential conflicts and signals found in your documents</p></div>
                <button type="button" className="text-action">See all <ArrowRight size={14} /></button>
              </div>

              <div className="claims-toolbar">
                <div className="filter-tabs" role="tablist" aria-label="Filter claims">
                  {filters.map((item) => <button key={item} role="tab" aria-selected={filter === item} className={clsx("filter-tab", filter === item && "selected")} onClick={() => setFilter(item)}>{item}{item === "All signals" && <span>24</span>}</button>)}
                </div>
                <label className="claim-search"><Search size={15} /><input aria-label="Search claims" placeholder="Search claims" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd><Command size={10} /> K</kbd></label>
                <button type="button" className="filter-button" aria-label="More filters"><SlidersHorizontal size={15} /></button>
              </div>

              <div className="claim-list">
                {visibleClaims.map((claim) => <button type="button" key={claim.id} onClick={() => setSelectedClaim(claim)} className={clsx("claim-row", selectedClaim.id === claim.id && "claim-selected")}>
                  <span className={clsx("claim-signal-icon", signalStyles[claim.signal])}>{claim.signal === "Conflict" ? <ArrowDownRight size={15} /> : claim.signal === "Potential bias" ? <SlidersHorizontal size={14} /> : <CircleHelp size={15} />}</span>
                  <span className="claim-row-content"><span className="claim-row-top"><strong>{claim.title}</strong><span className={clsx("signal-pill", signalStyles[claim.signal])}>{claim.signal}</span></span><span className="claim-row-meta"><span>{claim.id}</span><i />{claim.sources} sources<i /><Clock3 size={12} />{claim.updated}</span></span>
                  <span className="claim-confidence"><span>{claim.confidence}%</span><small>confidence</small></span>
                  <ChevronRight className="claim-chevron" size={16} />
                </button>)}
                {visibleClaims.length === 0 && <div className="empty-claims"><Search size={18} /><span>No claims match this search.</span></div>}
              </div>
              <button type="button" className="load-more">Show all 24 signals <ArrowRight size={14} /></button>
            </section>

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
              <div className="evidence-card evidence-support">
                <div className="evidence-card-head"><span className="evidence-label"><Check size={12} /> SUPPORTS</span><span className="evidence-match">Strong match</span></div>
                <p>“The maximum annual leave balance that may be carried forward is <mark>20 days</mark>.”</p>
                <button type="button" className="evidence-source"><span className="file-mini-icon"><FileText size={14} /></span><span><strong>Leave Policy · 2024.pdf</strong><small>Page 8 · paragraph 2</small></span><ExternalLink size={13} /></button>
              </div>
              <div className="evidence-card evidence-conflict">
                <div className="evidence-card-head"><span className="evidence-label"><ArrowDownRight size={12} /> CONTRADICTS</span><span className="evidence-match">Newer revision</span></div>
                <p>“Balances over <mark>15 days</mark> are paid out at the end of each year.”</p>
                <button type="button" className="evidence-source"><span className="file-mini-icon"><FileText size={14} /></span><span><strong>HR circular 2025-04.pdf</strong><small>Page 1 · paragraph 4</small></span><ExternalLink size={13} /></button>
              </div>

              <div className="research-branches">
                <div className="branches-heading"><span><Waypoints size={14} /> Research branches</span><button type="button">Details <ArrowUpRight size={12} /></button></div>
                <div className="branch-row"><span className="branch-node branch-node-archive"><Archive size={12} /></span><span><strong>Archive corpus</strong><small>12 linked documents</small></span><span className="branch-state">Matched</span></div>
                <div className="branch-row"><span className="branch-node branch-node-web"><Globe2 size={12} /></span><span><strong>External sources</strong><small>Fair Work · legislation.gov.au</small></span><span className="branch-state branch-state-neutral">2 references</span></div>
                <div className="branch-row"><span className="branch-node branch-node-bias"><Network size={12} /></span><span><strong>Bias &amp; context scan</strong><small>Scope may differ by employee type</small></span><span className="branch-state branch-state-warning">Review</span></div>
              </div>

              <div className="detail-actions">
                <button type="button" className={clsx("review-button", reviewed.includes(selectedClaim.id) && "reviewed")} onClick={markReviewed}>
                  {reviewed.includes(selectedClaim.id) ? <><Check size={15} /> Added to review queue</> : <><BookOpenCheck size={15} /> Mark for human review</>}
                </button>
                <button type="button" className="open-record-button"><SquareArrowOutUpRight size={14} /> Open original</button>
              </div>
              <p className="read-only-note"><LockKeyhole size={12} /> Sherlock can suggest changes. It never edits archival records.</p>
            </aside>
          </div>

          <section className="bottom-grid">
            <div className="source-card surface-card">
              <div className="panel-heading compact"><div><div className="section-title-line"><h2>Source reliability</h2><span className="info-dot">i</span></div><p>Observed track record across reviewed claims</p></div><button type="button" className="text-action">All sources <ArrowRight size={14} /></button></div>
              <div className="source-table">
                <div className="source-table-head"><span>SOURCE</span><span>RELIABILITY</span><span>LAST SEEN</span><span>LINKED CLAIMS</span></div>
                <SourceRow initials="HR" name="Human Resources" type="Internal · Policy owner" score="96%" width="96%" date="Today, 9:42 am" claims="42" tone="blue" />
                <SourceRow initials="FW" name="Fair Work Ombudsman" type="External · Government" score="93%" width="93%" date="Today, 9:40 am" claims="18" tone="green" />
                <SourceRow initials="OC" name="Operations circulars" type="Internal · Department" score="74%" width="74%" date="Yesterday" claims="27" tone="amber" />
              </div>
            </div>
            <div className="integrity-card surface-card">
              <div className="integrity-heading"><span className="integrity-icon"><Fingerprint size={17} /></span><span><strong>Archive integrity</strong><small>Connected and protected</small></span><span className="integrity-check"><Check size={13} /></span></div>
              <div className="integrity-divider" />
              <div className="integrity-item"><span>Connection</span><strong><span className="status-dot" /> Read-only source</strong></div>
              <div className="integrity-item"><span>Files fingerprinted</span><strong>100 / 100 <span className="integrity-ok"><Check size={11} /></span></strong></div>
              <div className="integrity-item"><span>Latest verification</span><strong>Today, 9:42 am</strong></div>
              <button type="button" className="integrity-link">View integrity log <ArrowRight size={13} /></button>
            </div>
          </section>

          <footer className="dashboard-footer"><span><LockKeyhole size={12} /> Private workspace · Analysis is stored securely</span><span>Last synced today at 9:42 am</span></footer>
        </div>
      </main>

      {showNotice && <div className="toast-notice"><Check size={15} /> Added to your human review queue <button type="button" onClick={() => setShowNotice(false)} aria-label="Dismiss"><X size={14} /></button></div>}
    </div>
  );
}

function MetricCard({ label, value, detail, icon: Icon, tone, trend }: { label: string; value: string; detail: string; icon: typeof FileText; tone: string; trend: string }) {
  return <div className="metric-card surface-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon metric-${tone}`}><Icon size={16} strokeWidth={1.8} /></span></div><div className="metric-value">{value}</div><div className="metric-detail">{detail}</div><div className="metric-trend"><span className={`trend-mark ${tone === "amber" ? "trend-amber" : ""}`}>{tone === "amber" ? <ArrowUpRight size={12} /> : <ArrowUpRight size={12} />}</span>{trend}</div></div>;
}

function SourceRow({ initials, name, type, score, width, date, claims: linkedClaims, tone }: { initials: string; name: string; type: string; score: string; width: string; date: string; claims: string; tone: string }) {
  return <div className="source-row"><div className="source-name-cell"><span className={`source-avatar source-${tone}`}>{initials}</span><span><strong>{name}</strong><small>{type}</small></span></div><div className="source-reliability"><strong>{score}</strong><span className="source-progress"><i style={{ width }} /></span></div><span className="source-last-seen">{date}</span><button type="button" className="linked-claims">{linkedClaims} claims <ChevronRight size={13} /></button></div>;
}
