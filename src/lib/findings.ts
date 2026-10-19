import { taxonomy } from "./config.ts";
import { allEntries, append, type LedgerEntry } from "./ledger.ts";
import { decide, groupKey } from "./relate.ts";
import { registerRows, rescoreAll, snapshot } from "./register.ts";
import { biasBySubject } from "./bias.ts";
import { issueRecalls, recallNotices } from "./impact.ts";
import type { ClaimRow } from "./extract.ts";
import type { Claim, Evidence, Finding as UiFinding, FindingType, Severity, SourceDoc } from "./results-data.ts";

export interface ReviewEntry {
  status: "confirmed" | "dismissed";
  note: string;
  reviewedAt: string;
  actor: string;
}

/** A finding as the Results screen renders it, plus what the backend needs to act on it. */
export type Finding = UiFinding & {
  /** Relationships a decision on this finding confirms or dismisses. */
  relationshipIds?: string[];
  /** One-click remedies, e.g. adding the out-of-scope records behind a bias gap. */
  actions?: { kind: "scope_add"; documentIds: string[]; label: string }[];
  history?: ReviewEntry[];
};

/**
 * The live register in the shapes the Results, Sources and Dashboard screens already use
 * (src/lib/results-data.ts and src/lib/mock-dashboard.ts), so the components need no changes.
 */

const COLLECTION_NAME = "Riverbend Flood Recovery Grant";
const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const DECISIVE = new RegExp(`(\\$[\\d,]+|\\b\\d{1,2} (?:${MONTHS}) \\d{4}\\b|\\bBSB [\\d-]+|\\baccount \\d+|owner-occupiers only|renters|statutory declaration|utility bill or (?:a )?lease)`, "gi");
const highlight = (quote: string) => quote.replace(DECISIVE, "[[$1]]");
const unquote = (s: string) => s.replace(/\.$/, "");
const sydney = (iso: string) =>
  new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function severityOfBand(band: string | null): Severity {
  return band === "High" || band === "Extreme" ? "high" : band === "Medium" ? "medium" : "low";
}

export function results() {
  const snap = snapshot();
  const rows = new Map(registerRows().map((r) => [r.id, r]));
  const tax = taxonomy();
  const claimById = new Map(snap.claims.map((c) => [c.id, c]));
  const doc = (c: ClaimRow) => snap.docsById.get(c.document_id)!;
  const state = (id: string) => snap.states.get(id)!;
  const members = (c: ClaimRow) => snap.claims.filter((o) => groupKey(o) === groupKey(c));
  const docIdsOf = (cs: ClaimRow[]) => [...new Set(cs.map((c) => c.document_id))];
  const consequenceSeverity = (ids: string[]): Severity => {
    const max = Math.max(...ids.map((id) => tax.functions[snap.docsById.get(id)!.function].consequence));
    return max >= 4 ? "high" : max === 3 ? "medium" : "low";
  };

  const docs: SourceDoc[] = snap.docs.map((d) => ({
    id: d.id,
    title: d.title,
    source: d.unit === "unknown" ? "Unknown source" : d.unit,
    year: Number(d.date.slice(0, 4)),
  }));

  const origins = snap.claims.filter((c) => state(c.id).originId === c.id);
  const claims: Claim[] = origins.map((o) => {
    const s = state(o.id);
    const status: Claim["status"] =
      s.status === "superseded" || s.status === "corrected" ? "superseded"
      : s.status !== "current" || s.contradicted ? "review"
      : s.agreements >= 2 ? "corroborated"
      : s.agreements === 0 ? "single"
      : "current";
    return { id: o.id, text: o.statement, origin: o.document_id, citedBy: docIdsOf(members(o)), status };
  });

  const findings: Finding[] = [];
  const unsupported = snap.claims.filter((c) => state(c.id).status === "unsupported" && c.subject !== "other");
  const unsupportedIds = new Set(unsupported.map((c) => c.id));

  // Relationships: supersessions and scope questions per relationship, contradictions per contradicted claim.
  const contradictions = new Map<string, { claim: ClaimRow; rels: typeof snap.relationships; confirmed: boolean }>();
  for (const rel of snap.relationships) {
    const decided = snap.decided.get(rel.id);
    const type = decided?.status === "confirmed" ? decided.type : rel.type;
    const status: Finding["status"] = decided?.status === "confirmed" ? "confirmed" : decided?.status === "dismissed" ? "dismissed" : "open";
    const from = claimById.get(rel.from_claim_id)!;
    const to = claimById.get(rel.to_claim_id)!;
    const evidence = (a: ClaimRow, b: ClaimRow, la: string, lb: string): Evidence[] => [
      { label: la, docId: a.document_id, quote: highlight(a.quote) },
      { label: lb, docId: b.document_id, quote: highlight(b.quote) },
    ];

    if (type === "supersedes" || type === "corrects") {
      const stale = members(to);
      const staleDocs = docIdsOf(stale);
      const independent = new Set(stale.filter((c) => !state(c.id).echoOf).map((c) => doc(c).unit)).size;
      findings.push({
        id: `M-${rel.id}`,
        type: "misinformation",
        kind: "supersedes",
        severity: consequenceSeverity(staleDocs),
        confidence: Math.round(rel.confidence * 100),
        status,
        title: `“${unquote(to.statement)}” is ${type === "corrects" ? "corrected" : "out of date"}`,
        summary: `${doc(from).title} (${doc(from).id}) says otherwise. ${staleDocs.length} document${staleDocs.length > 1 ? "s" : ""} still state the old rule${independent === 1 && staleDocs.length > 1 ? ", and all of them trace back to one original" : ""}.`,
        evidence: evidence(to, from, "Older", "Newer"),
        docIds: staleDocs,
        claimIds: [to.id, from.id],
        relationshipIds: [rel.id],
      });
    } else if (type === "different_scope") {
      findings.push({
        id: `M-${rel.id}`,
        type: "misinformation",
        kind: "possible-conflict",
        severity: "low",
        confidence: Math.round(rel.confidence * 100),
        status: status === "confirmed" ? "dismissed" : status,
        title: `${tax.subjects[from.subject]?.label ?? from.subject}: different rules for different people?`,
        summary: rel.rationale,
        evidence: evidence(from, to, "Newer", "Older"),
        docIds: [from.document_id, to.document_id],
        claimIds: [from.id, to.id],
        relationshipIds: [rel.id],
      });
    } else {
      for (const c of [from, to]) {
        if (!state(c.id).contradicted || unsupportedIds.has(c.id)) continue;
        const entry = contradictions.get(c.id) ?? { claim: c, rels: [], confirmed: false };
        entry.rels.push(rel);
        entry.confirmed ||= decided?.status === "confirmed";
        contradictions.set(c.id, entry);
      }
    }
  }

  for (const { claim, rels, confirmed } of contradictions.values()) {
    const d = doc(claim);
    const row = rows.get(d.id)!;
    const by = state(claim.id).contradictedBy.map((id) => claimById.get(id)!);
    const custody = JSON.parse(d.custody) as string[];
    const weak = d.unit === "unknown" || custody.includes("external");
    const declaredDocs = docIdsOf(by);
    findings.push({
      id: `${weak ? "X" : "M"}-${claim.id}`,
      type: weak ? "disinformation" : "misinformation",
      kind: weak ? "provenance" : "possible-conflict",
      severity: severityOfBand(row.band),
      confidence: Math.round(Math.max(...rels.map((r) => r.confidence)) * 100),
      status: confirmed || row.review === "rejected" ? "confirmed" : "open",
      title: `“${unquote(claim.statement)}” contradicts declared records`,
      summary: `${d.title} (${d.id}) ${weak ? `has ${d.unit === "unknown" ? "an unknown creator" : `creator ${d.unit}`}${custody.includes("external") ? " and came from outside the organisation" : ""}. ` : ""}It conflicts with ${declaredDocs.join(", ")}. ${row.aiReadable ? "The assistant can read it." : "The assistant cannot read it."}`,
      evidence: [
        { label: "Claim", docId: d.id, quote: highlight(claim.quote) },
        ...by.slice(0, 2).map((b) => ({ label: "Declared record", docId: b.document_id, quote: highlight(b.quote) })),
      ],
      docIds: [d.id, ...declaredDocs],
      claimIds: [claim.id, ...by.map((b) => b.id)],
      relationshipIds: rels.map((r) => r.id),
    });
  }

  for (const c of unsupported) {
    const conflicting = state(c.id).contradictedBy.map((id) => claimById.get(id)!);
    findings.push({
      id: `M-${c.id}`,
      type: "misinformation",
      kind: "unsourced",
      severity: consequenceSeverity([c.document_id]),
      confidence: 100,
      status: "open",
      title: `“${unquote(c.statement)}” has no source in the records`,
      summary: `${doc(c).title} (${doc(c).id}) is AI-generated and unreviewed, and no record in the collection states this.${conflicting.length ? ` Declared records say otherwise (${docIdsOf(conflicting).join(", ")}).` : ""}`,
      evidence: [
        { label: "AI-generated", docId: c.document_id, quote: highlight(c.quote) },
        ...conflicting.slice(0, 1).map((b) => ({ label: "Declared record", docId: b.document_id, quote: highlight(b.quote) })),
      ],
      docIds: [c.document_id, ...docIdsOf(conflicting)],
      claimIds: [c.id, ...conflicting.map((b) => b.id)],
    });
  }

  // Current rules that many documents repeat but only one unit actually states.
  for (const o of origins) {
    const s = state(o.id);
    const group = members(o);
    const docIds = docIdsOf(group);
    if (o.subject === "other" || s.status !== "current" || docIds.length < 3) continue;
    const units = new Set(group.filter((c) => !state(c.id).echoOf).map((c) => doc(c).unit));
    if (units.size > 1) continue;
    findings.push({
      id: `B-${o.id}`,
      type: "bias",
      kind: "single-source",
      severity: "medium",
      confidence: 90,
      status: "open",
      title: `“${unquote(o.statement)}” rests on one original source`,
      summary: `${docIds.length} documents state it, but every one traces back to ${doc(o).unit}. It counts as one source, not ${docIds.length}.`,
      evidence: [{ label: "Origin", docId: o.document_id, quote: highlight(o.quote) }],
      docIds,
      claimIds: [o.id],
    });
  }

  // Representation per subject. A subject that dropped to Low after a scope change shows as resolved.
  const scoped = new Set(allEntries().filter((e) => e.action === "SCOPE_ADD" || e.action === "APPROVE").map((e) => e.target_id));
  for (const b of biasBySubject()) {
    const touched = snap.claims.some((c) => c.subject === b.subject && scoped.has(c.document_id));
    // A Low subject is only worth showing when a scope change is what brought in a second region.
    if (b.rating === "Low" && !(touched && b.shares.length > 1)) continue;
    if (b.rating === "Medium" && !b.gaps.length) continue; // concentration alone: listed in /api/bias, not as a finding
    const gapDocs = b.gaps.flatMap((g) => g.documents);
    const sample = snap.claims.find((c) => c.subject === b.subject && gapDocs.includes(c.document_id)) ?? snap.claims.find((c) => c.subject === b.subject);
    findings.push({
      id: `B-${b.subject}`,
      type: "bias",
      kind: "representation",
      severity: b.rating === "High" ? "high" : b.rating === "Medium" ? "medium" : "low",
      confidence: Math.round(b.concentration * 100),
      status: b.rating === "Low" ? "confirmed" : "open",
      title: b.rating === "Low" ? `${b.label} now draws on more than one region` : b.message.split(". ")[0] + ".",
      summary: b.rating === "Low" ? b.message : b.message.split(". ").slice(1).join(". ") || b.message,
      evidence: sample ? [{ label: gapDocs.includes(sample.document_id) ? "Outside AI scope" : "In scope", docId: sample.document_id, quote: highlight(sample.quote) }] : [],
      docIds: gapDocs.length ? gapDocs : docIdsOf(snap.claims.filter((c) => c.subject === b.subject)),
      claimIds: sample ? [sample.id] : [],
      actions: gapDocs.length ? [{ kind: "scope_add", documentIds: gapDocs, label: `Add ${gapDocs.join(" and ")} to the assistant's scope` }] : [],
    });
  }

  for (const r of registerRows()) {
    const d = snap.docsById.get(r.id)!;
    const t = allEntries().filter((e) => e.action === "TAMPER_DETECTED" && e.target_id === r.id).at(-1);
    if (!t || !r.gateReason.startsWith("Integrity failure")) continue;
    const p = JSON.parse(t.payload_json);
    findings.push({
      id: `X-${r.id}-altered`,
      type: "disinformation",
      kind: "altered",
      severity: "high",
      confidence: 99,
      status: "open",
      title: `${d.title} no longer matches its fingerprint`,
      summary: "The file's SHA-256 changed after it was ingested. Someone edited it or replaced it. The original hash is in the ledger.",
      evidence: [
        { label: "At ingest", quote: `${p.expected.slice(0, 12)}…${p.expected.slice(-8)}`, mono: true },
        { label: "Now", quote: `${String(p.observed).slice(0, 12)}…${String(p.observed).slice(-8)}`, mono: true },
      ],
      docIds: [r.id],
      claimIds: snap.claims.filter((c) => c.document_id === r.id).map((c) => c.id),
    });
  }

  // Decisions recorded against a finding itself (those with no relationship behind them).
  const entries = allEntries();
  for (const f of findings) {
    const targets = new Set([f.id, ...(f.relationshipIds ?? [])]);
    f.history = entries
      .filter((e) => targets.has(e.target_id) && (e.action === "CONFIRM" || e.action === "DISMISS"))
      .map((e) => ({ status: e.action === "CONFIRM" ? "confirmed" : "dismissed", note: e.reason ?? "", reviewedAt: sydney(e.ts_utc), actor: e.actor }));
    const own = entries.filter((e) => e.target_type === "finding" && e.target_id === f.id).at(-1);
    if (own) f.status = own.action === "CONFIRM" ? "confirmed" : "dismissed";
  }

  const lastScore = registerRows().length ? allEntries().at(-1)?.ts_utc : undefined;
  return {
    collection: { name: COLLECTION_NAME, scannedAt: lastScore ? `Updated ${sydney(lastScore)}` : "Not scanned yet" },
    docs,
    claims,
    findings,
  };
}

const ACTIVITY_TYPE: Partial<Record<LedgerEntry["action"], FindingType | "system">> = {
  CONFIRM: "misinformation",
  DISMISS: "misinformation",
  CHANGE_RELATIONSHIP: "misinformation",
  SCOPE_ADD: "bias",
  TAMPER_DETECTED: "disinformation",
  REJECT: "disinformation",
};

const words = (type: string) => (type === "different_scope" ? "has a different scope from" : type);

function activityText(e: LedgerEntry): string {
  const p = JSON.parse(e.payload_json);
  switch (e.action) {
    case "INGEST": return `${e.actor} added ${e.target_id}: ${p.title}`;
    case "APPROVE": return `${e.actor} approved ${e.target_id} for the assistant`;
    case "REJECT": return `${e.actor} kept ${e.target_id} out of the assistant's reach`;
    case "CONFIRM": return `${e.actor} confirmed ${p.from} ${words(p.type)} ${p.to}`;
    case "DISMISS": return `${e.actor} dismissed ${p.from} ${words(p.proposed_type)} ${p.to}`;
    case "CHANGE_RELATIONSHIP": return `${e.actor} changed ${e.target_id} to ${words(p.type)}`;
    case "SCOPE_ADD": return `${e.actor} added ${e.target_id} to the assistant's scope`;
    case "GATE_OVERRIDE": return `${e.actor} overrode the gate for ${e.target_id}`;
    case "RECALL_ISSUED": return `Recall notice for answer ${e.target_id} sent to ${p.staff_id}`;
    case "TAMPER_DETECTED": return `${e.target_id} no longer matches its fingerprint`;
    case "PROPOSE_RELATIONSHIP": return `Sherlock proposed ${p.from} ${words(p.type)} ${p.to}`;
    case "EXTRACT": return `Sherlock read ${(p.claims as unknown[]).length} claims from ${e.target_id}`;
    default: return `${e.action} ${e.target_id}`;
  }
}

const RAISED = new Set(["PROPOSE_RELATIONSHIP", "TAMPER_DETECTED"]);
const RESOLVED = new Set(["CONFIRM", "DISMISS", "CHANGE_RELATIONSHIP", "REJECT"]);

/** Findings raised versus decisions made per day (Australia/Sydney) over the last 8 days, from the ledger. */
function trend(entries: LedgerEntry[]) {
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const days = Array.from({ length: 8 }, (_, i) => day(new Date(Date.now() - (7 - i) * 86_400_000)));
  const count = (set: Set<string>) => days.map((d) => entries.filter((e) => set.has(e.action) && day(new Date(e.ts_utc)) === d).length);
  return { labels: days.map((_, i) => (i === 7 ? "Today" : `-${7 - i}d`)), found: count(RAISED), resolved: count(RESOLVED) };
}

/** Dashboard numbers in the shapes of mock-dashboard.ts, from the live register and ledger. */
export function dashboard() {
  const { findings, docs } = results();
  const rows = registerRows();
  const snap = snapshot();
  const open = findings.filter((f) => f.status === "open");
  const byType = (fs: Finding[]) =>
    ({ bias: fs.filter((f) => f.type === "bias").length, misinformation: fs.filter((f) => f.type === "misinformation").length, disinformation: fs.filter((f) => f.type === "disinformation").length });
  const latest = new Map<string, LedgerEntry>();
  for (const e of allEntries()) if (["CONFIRM", "DISMISS", "CHANGE_RELATIONSHIP"].includes(e.action)) latest.set(e.target_id, e);
  const agreed = [...latest.values()].filter((e) => e.action === "CONFIRM").length;
  const agreement = latest.size ? Math.round((agreed / latest.size) * 100) : 100;
  const flat = (n: number) => Array(8).fill(n);
  const next: Finding | undefined = [...open].sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.severity] - ({ high: 0, medium: 1, low: 2 })[b.severity] || b.confidence - a.confidence)[0];
  const evidenceFrom = (e?: Evidence) => e && { text: e.quote.replace(/\[\[|\]\]/g, ""), from: docs.find((d) => d.id === e.docId)?.title ?? "" };
  const units = new Set(rows.map((r) => r.unit));
  const entries = allEntries();

  return {
    lastInvestigation: {
      id: "riverbend-flood-recovery-grant",
      name: COLLECTION_NAME,
      documents: rows.length,
      sources: units.size,
      lastWorked: entries.at(-1) ? sydney(entries.at(-1)!.ts_utc) : "Never",
      reviewed: findings.length - open.length,
      total: findings.length,
      open: byType(open),
      next: next ? { type: next.type, title: next.title, summary: next.summary, confidence: next.confidence, documents: next.docIds.length, older: evidenceFrom(next.evidence[0]), newer: evidenceFrom(next.evidence[1]) } : null,
    },
    kpis: [
      { label: "Open findings", value: open.length, delta: `${findings.length - open.length} resolved`, good: true, spark: flat(open.length) },
      { label: "Readable by the assistant", value: rows.filter((r) => r.aiReadable).length, delta: `${rows.filter((r) => r.gate === "blocked").length} blocked`, good: true, spark: flat(rows.filter((r) => r.aiReadable).length) },
      { label: "Awaiting your review", value: rows.filter((r) => r.review === "awaiting").length, delta: "Uploads from staff", good: true, spark: flat(rows.filter((r) => r.review === "awaiting").length) },
      { label: "Agreement with Sherlock", value: agreement, suffix: "%", delta: "How often you confirm its proposals", good: true, spark: flat(agreement) },
    ],
    openByType: byType(open),
    recalls: recallNotices().length,
    investigations: [
      {
        id: "riverbend-flood-recovery-grant",
        name: COLLECTION_NAME,
        documents: rows.length,
        status: (open.length ? "needs-review" : "resolved") as "needs-review" | "scanning" | "resolved",
        progress: findings.length ? (findings.length - open.length) / findings.length : 1,
        open: open.length,
        lastActive: entries.at(-1) ? sydney(entries.at(-1)!.ts_utc) : "Never",
      },
    ],
    trend: trend(entries),
    activity: entries
      .filter((e) => !["EXTRACT_REJECTED"].includes(e.action))
      .slice(-12)
      .reverse()
      .map((e) => ({ id: `a${e.seq}`, type: ACTIVITY_TYPE[e.action] ?? "system", text: activityText(e), where: e.target_id, when: sydney(e.ts_utc) })),
    sourceWatch: [...units].map((unit) => {
      const unitClaims = snap.claims.filter((c) => snap.docsById.get(c.document_id)!.unit === unit);
      const count = (pred: (id: string) => boolean) => unitClaims.filter((c) => pred(c.id)).length;
      const st = (id: string) => snap.states.get(id)!;
      const corroborated = count((id) => st(id).status === "current" && !st(id).contradicted && st(id).agreements >= 2);
      const superseded = count((id) => st(id).supersededChanged);
      const review = count((id) => st(id).contradicted || st(id).status === "unsupported" || st(id).status === "disputed");
      const single = count((id) => st(id).status === "current" && !st(id).contradicted && st(id).agreements === 0);
      const echoes = count((id) => Boolean(st(id).echoOf));
      const note = review ? "Has claims that conflict with declared records" : superseded ? "Some claims are now superseded" : echoes === unitClaims.length && echoes ? "Only repeats other sources" : single > corroborated ? "Mostly single-source claims" : "Independent and consistent";
      return { name: unit === "unknown" ? "Unknown source" : unit, note, corroborated, review, superseded, single };
    }),
  };
}

export class FindingError extends Error {}

/**
 * The Results drawer's decision. A finding backed by relationships confirms or dismisses them
 * (confirming issues recall notices); any other finding records the decision against itself.
 */
export function decideFinding(id: string, status: "confirmed" | "dismissed", note: string, actor: string) {
  const finding = results().findings.find((f) => f.id === id);
  if (!finding) throw new FindingError(`No finding ${id}.`);
  if (finding.status !== "open") throw new FindingError(`${id} is already ${finding.status}.`);
  let recalls = 0;
  if (finding.relationshipIds?.length) {
    for (const rel of finding.relationshipIds) {
      decide(rel, status === "confirmed" ? "confirm" : "dismiss", actor, note);
      rescoreAll();
      if (status === "confirmed") recalls += issueRecalls(rel, actor).length;
    }
  } else {
    append({ actor, action: status === "confirmed" ? "CONFIRM" : "DISMISS", targetType: "finding", targetId: id, payload: { title: finding.title, type: finding.type }, reason: note });
  }
  return { finding: results().findings.find((f) => f.id === id) ?? null, recallsIssued: recalls };
}
