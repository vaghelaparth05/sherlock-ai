import type { Claim, Finding, FindingStatus, FindingType, Severity, SourceDoc } from "@/lib/types";

/** Everything the results, sources and summary screens are computed from. */
export interface ScanData {
  docs: SourceDoc[];
  claims: Claim[];
  findings: Finding[];
}

export const TYPES: FindingType[] = ["misinformation", "bias", "disinformation"];
export const SEVERITIES: Severity[] = ["high", "medium", "low"];
const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export const docLookup = (docs: SourceDoc[]) => {
  const map = new Map(docs.map((d) => [d.id, d]));
  return (id: string) => map.get(id);
};

export const yearLabel = (year: number | null | undefined) => (year ? String(year) : "n.d.");

export function summarise(findings: Finding[]) {
  const byType = Object.fromEntries(TYPES.map((t) => [t, { total: 0, open: 0 }])) as Record<FindingType, { total: number; open: number }>;
  const matrix = Object.fromEntries(
    TYPES.map((t) => [t, Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>]),
  ) as Record<FindingType, Record<Severity, number>>;
  const bySeverity = { high: 0, medium: 0, low: 0 } as Record<Severity, number>;
  let open = 0;
  let confirmed = 0;
  let dismissed = 0;
  for (const f of findings) {
    byType[f.type].total++;
    if (f.status === "open") {
      byType[f.type].open++;
      matrix[f.type][f.severity]++;
      bySeverity[f.severity]++;
      open++;
    } else if (f.status === "confirmed") confirmed++;
    else dismissed++;
  }
  return { total: findings.length, open, confirmed, dismissed, resolved: findings.length - open, byType, matrix, bySeverity };
}

export interface Filters {
  type: FindingType | "all";
  severity: Severity | "all";
  status: FindingStatus | "all" | "resolved";
  query: string;
  sort: "severity" | "confidence" | "documents";
}

export function applyFilters(findings: Finding[], f: Filters, docs: SourceDoc[]): Finding[] {
  const doc = docLookup(docs);
  const q = f.query.trim().toLowerCase();
  const out = findings.filter((x) => {
    if (f.type !== "all" && x.type !== f.type) return false;
    if (f.severity !== "all" && x.severity !== f.severity) return false;
    if (f.status === "resolved" && x.status === "open") return false;
    if (f.status !== "all" && f.status !== "resolved" && x.status !== f.status) return false;
    if (q) {
      const hay = [x.title, x.summary, ...x.evidence.map((e) => e.quote), ...x.docIds.map((id) => doc(id)?.title ?? ""), ...x.docIds.map((id) => doc(id)?.source ?? "")]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return out.sort((a, b) => {
    if (f.sort === "confidence") return b.confidence - a.confidence;
    if (f.sort === "documents") return b.docIds.length - a.docIds.length;
    return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.confidence - a.confidence;
  });
}

export function sourceNamesOf(f: Finding, docs: SourceDoc[]): string[] {
  const doc = docLookup(docs);
  return [...new Set(f.docIds.map((id) => doc(id)?.source).filter((s): s is string => !!s))];
}

export const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "source";

export interface SourceStat {
  slug: string;
  /** Claims that have actually been checked: held up, still under review, or superseded. */
  checked: { held: number; total: number; pct: number | null };
  name: string;
  documents: SourceDoc[];
  years: [number, number];
  own: Claim[];
  repeats: Claim[];
  buckets: { good: number; single: number; review: number; superseded: number };
  openFlags: number;
  verdict: "reliable" | "attention" | "echo";
}

export function sourceStats(data: ScanData): SourceStat[] {
  const doc = docLookup(data.docs);
  const names = [...new Set(data.docs.map((d) => d.source))];
  return names
    .map((name) => {
      const documents = data.docs.filter((d) => d.source === name);
      const docIds = new Set(documents.map((d) => d.id));
      const own = data.claims.filter((c) => doc(c.origin)?.source === name);
      const repeats = data.claims.filter((c) => doc(c.origin)?.source !== name && c.citedBy.some((id) => docIds.has(id)));
      const buckets = { good: 0, single: 0, review: 0, superseded: 0 };
      for (const c of own) {
        if (c.status === "corroborated" || c.status === "current") buckets.good++;
        else buckets[c.status]++;
      }
      const openFlags = data.findings.filter((f) => f.status === "open" && f.docIds.some((id) => docIds.has(id))).length;
      const years = documents.map((d) => d.year).filter((y) => y > 0);
      const checkedTotal = buckets.good + buckets.review + buckets.superseded;
      const verdict: SourceStat["verdict"] =
        own.length === 0 ? "echo" : buckets.review > 0 || buckets.superseded > 0 || openFlags > 0 ? "attention" : "reliable";
      return {
        slug: slugOf(name),
        checked: { held: buckets.good, total: checkedTotal, pct: checkedTotal ? Math.round((buckets.good / checkedTotal) * 100) : null },
        name,
        documents,
        years: (years.length ? [Math.min(...years), Math.max(...years)] : [0, 0]) as [number, number],
        own,
        repeats,
        buckets,
        openFlags,
        verdict,
      };
    })
    .sort((a, b) => {
      const rank = { attention: 0, echo: 1, reliable: 2 } as const;
      return rank[a.verdict] - rank[b.verdict] || b.openFlags - a.openFlags;
    });
}

export interface SourceDetail {
  stat: SourceStat;
  activity: { year: number; documents: number; claims: number }[];
  peakYears: number[];
  repeatsFrom: { claim: Claim; origin: SourceDoc | undefined }[];
  related: Finding[];
}

export function sourceDetail(data: ScanData, slug: string): SourceDetail | null {
  const stat = sourceStats(data).find((s) => s.slug === slug);
  if (!stat) return null;
  const doc = docLookup(data.docs);

  // Only this source's own years, padded so a single year still reads as a chart.
  const years = stat.documents.map((d) => d.year).filter((y) => y > 0);
  const first = years.length ? Math.min(...years) - (new Set(years).size === 1 ? 1 : 0) : 0;
  const last = years.length ? Math.max(...years) + (new Set(years).size === 1 ? 1 : 0) : 0;
  const activity = years.length
    ? Array.from({ length: last - first + 1 }, (_, i) => {
        const year = first + i;
        return {
          year,
          documents: stat.documents.filter((d) => d.year === year).length,
          claims: stat.own.filter((c) => doc(c.origin)?.year === year).length,
        };
      })
    : [];
  const most = activity.length ? Math.max(...activity.map((a) => a.documents)) : 0;

  const docIds = new Set(stat.documents.map((d) => d.id));
  return {
    stat,
    activity,
    peakYears: most > 0 ? activity.filter((a) => a.documents === most).map((a) => a.year) : [],
    repeatsFrom: stat.repeats.map((claim) => ({ claim, origin: doc(claim.origin) })),
    related: data.findings.filter((f) => f.docIds.some((id) => docIds.has(id))),
  };
}
