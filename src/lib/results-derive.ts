import {
  CLAIMS,
  DOCS,
  type Claim,
  type Finding,
  type FindingStatus,
  type FindingType,
  type Severity,
  type SourceDoc,
} from "@/lib/results-data";

export const TYPES: FindingType[] = ["misinformation", "bias", "disinformation"];
export const SEVERITIES: Severity[] = ["high", "medium", "low"];
const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export function docById(id: string): SourceDoc | undefined {
  return DOCS.find((d) => d.id === id);
}

export function summarise(findings: Finding[]) {
  const byType = Object.fromEntries(TYPES.map((t) => [t, { total: 0, open: 0 }])) as Record<FindingType, { total: number; open: number }>;
  const matrix = Object.fromEntries(
    TYPES.map((t) => [t, Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>]),
  ) as Record<FindingType, Record<Severity, number>>;
  let open = 0;
  for (const f of findings) {
    byType[f.type].total++;
    if (f.status === "open") {
      byType[f.type].open++;
      matrix[f.type][f.severity]++;
      open++;
    }
  }
  return { total: findings.length, open, resolved: findings.length - open, byType, matrix };
}

export interface Filters {
  type: FindingType | "all";
  severity: Severity | "all";
  status: FindingStatus | "all" | "resolved";
  query: string;
  sort: "severity" | "confidence" | "documents";
}

export function applyFilters(findings: Finding[], f: Filters): Finding[] {
  const q = f.query.trim().toLowerCase();
  const out = findings.filter((x) => {
    if (f.type !== "all" && x.type !== f.type) return false;
    if (f.severity !== "all" && x.severity !== f.severity) return false;
    if (f.status === "resolved" && x.status === "open") return false;
    if (f.status !== "all" && f.status !== "resolved" && x.status !== f.status) return false;
    if (q) {
      const hay = [
        x.title,
        x.summary,
        ...x.evidence.map((e) => e.quote),
        ...x.docIds.map((id) => docById(id)?.title ?? ""),
        ...x.docIds.map((id) => docById(id)?.source ?? ""),
      ]
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

export function sourceNamesOf(f: Finding): string[] {
  return [...new Set(f.docIds.map((id) => docById(id)?.source).filter((s): s is string => !!s))];
}

export const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

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

export function sourceStats(findings: Finding[]): SourceStat[] {
  const names = [...new Set(DOCS.map((d) => d.source))];
  return names
    .map((name) => {
      const documents = DOCS.filter((d) => d.source === name);
      const docIds = new Set(documents.map((d) => d.id));
      const own = CLAIMS.filter((c) => docById(c.origin)?.source === name);
      const repeats = CLAIMS.filter((c) => docById(c.origin)?.source !== name && c.citedBy.some((id) => docIds.has(id)));
      const buckets = { good: 0, single: 0, review: 0, superseded: 0 };
      for (const c of own) {
        if (c.status === "corroborated" || c.status === "current") buckets.good++;
        else buckets[c.status]++;
      }
      const openFlags = findings.filter((f) => f.status === "open" && f.docIds.some((id) => docIds.has(id))).length;
      const years = documents.map((d) => d.year);
      const verdict: SourceStat["verdict"] =
        own.length === 0 ? "echo" : buckets.review > 0 || buckets.superseded > 0 || openFlags > 0 ? "attention" : "reliable";
      const checkedTotal = buckets.good + buckets.review + buckets.superseded;
      const checked = {
        held: buckets.good,
        total: checkedTotal,
        pct: checkedTotal ? Math.round((buckets.good / checkedTotal) * 100) : null,
      };
      return {
        slug: slugOf(name),
        checked,
        name,
        documents,
        years: [Math.min(...years), Math.max(...years)] as [number, number],
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

export function sourceSlugs(): string[] {
  return [...new Set(DOCS.map((d) => d.source))].map(slugOf);
}

export interface SourceDetail {
  stat: SourceStat;
  activity: { year: number; documents: number; claims: number }[];
  peakYears: number[];
  repeatsFrom: { claim: Claim; origin: SourceDoc | undefined }[];
  related: Finding[];
}

export function sourceDetail(findings: Finding[], slug: string): SourceDetail | null {
  const stat = sourceStats(findings).find((s) => s.slug === slug);
  if (!stat) return null;

  const allYears = DOCS.map((d) => d.year);
  const first = Math.min(...allYears);
  const last = Math.max(...allYears);
  const activity = Array.from({ length: last - first + 1 }, (_, i) => {
    const year = first + i;
    return {
      year,
      documents: stat.documents.filter((d) => d.year === year).length,
      claims: stat.own.filter((c) => docById(c.origin)?.year === year).length,
    };
  });
  const most = Math.max(...activity.map((a) => a.documents));

  const docIds = new Set(stat.documents.map((d) => d.id));
  return {
    stat,
    activity,
    peakYears: most > 0 ? activity.filter((a) => a.documents === most).map((a) => a.year) : [],
    repeatsFrom: stat.repeats.map((claim) => ({ claim, origin: docById(claim.origin) })),
    related: findings.filter((f) => f.docIds.some((id) => docIds.has(id))),
  };
}
