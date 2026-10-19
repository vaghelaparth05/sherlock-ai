/**
 * SAMPLE DATA for the dashboard. Nothing here is read from a real investigation yet.
 * The shapes mirror what the scanning and results steps will produce, so swapping
 * this file for real queries should not change the components.
 */

export type FindingType = "bias" | "misinformation" | "disinformation";

export const TYPE_META: Record<FindingType, { label: string; color: string; soft: string; blurb: string }> = {
  bias: {
    label: "Bias",
    color: "var(--bias)",
    soft: "var(--bias-soft)",
    blurb: "Sources or viewpoints that are over- or under-represented",
  },
  misinformation: {
    label: "Misinformation",
    color: "var(--misinfo)",
    soft: "var(--misinfo-soft)",
    blurb: "Claims that are wrong or out of date, shared without intent",
  },
  disinformation: {
    label: "Disinformation",
    color: "var(--disinfo)",
    soft: "var(--disinfo-soft)",
    blurb: "Altered or deliberately misleading content",
  },
};

export type InvestigationStatus = "needs-review" | "scanning" | "resolved";

export interface Investigation {
  id: string;
  name: string;
  documents: number;
  status: InvestigationStatus;
  /** 0..1: scan progress while scanning, otherwise share of findings reviewed */
  progress: number;
  open: number;
  lastActive: string;
}

export const LAST_INVESTIGATION = {
  id: "staff-leave-policy",
  name: "Staff leave policy",
  documents: 12,
  sources: 8,
  lastWorked: "2 hours ago",
  reviewed: 9,
  total: 15,
  open: { bias: 2, misinformation: 3, disinformation: 1 } satisfies Record<FindingType, number>,
  next: {
    type: "misinformation" as FindingType,
    title: "“Annual leave is 20 days” may be out of date",
    summary: "7 documents still state the old figure, but they all trace back to one original source.",
    confidence: 94,
    documents: 7,
    older: { text: "Full-time staff are entitled to 20 days of annual leave each year.", from: "Leave Policy v2 · 2022" },
    newer: { text: "From 1 July 2026, full-time staff are entitled to 25 days of annual leave.", from: "Leave Policy v3 · signed" },
  },
};

export const KPIS = [
  { label: "Open findings", value: 14, delta: "3 fewer than last week", good: true, spark: [22, 21, 19, 20, 18, 17, 16, 14] },
  { label: "Resolved this week", value: 13, delta: "2 more than last week", good: true, spark: [2, 4, 5, 6, 9, 10, 11, 13] },
  { label: "Documents under watch", value: 148, delta: "12 added this week", good: true, spark: [96, 104, 110, 118, 124, 132, 136, 148] },
  { label: "Agreement with Sherlock", value: 87, suffix: "%", delta: "How often you confirm its proposals", good: true, spark: [78, 80, 83, 82, 85, 84, 86, 87] },
];

export const TREND = {
  labels: ["-7w", "-6w", "-5w", "-4w", "-3w", "-2w", "-1w", "This week"],
  found: [4, 7, 5, 9, 12, 8, 15, 11],
  resolved: [2, 4, 5, 6, 9, 10, 11, 13],
};

export const OPEN_BY_TYPE: Record<FindingType, number> = { bias: 4, misinformation: 8, disinformation: 2 };

export const INVESTIGATIONS: Investigation[] = [
  { id: "staff-leave-policy", name: "Staff leave policy", documents: 12, status: "needs-review", progress: 0.6, open: 6, lastActive: "2 hours ago" },
  { id: "procurement-2024", name: "Procurement guidelines 2024", documents: 38, status: "needs-review", progress: 0.41, open: 7, lastActive: "Yesterday" },
  { id: "grant-evaluation", name: "Grant program evaluation", documents: 64, status: "scanning", progress: 0.72, open: 1, lastActive: "Scanning now" },
  { id: "disposal-authority", name: "Records disposal authority", documents: 22, status: "resolved", progress: 1, open: 0, lastActive: "3 days ago" },
  { id: "ministerial-briefs", name: "Ministerial briefs Q2", documents: 12, status: "resolved", progress: 1, open: 0, lastActive: "Last week" },
];

export const ACTIVITY: { id: string; type: FindingType | "system"; text: string; where: string; when: string }[] = [
  { id: "a1", type: "misinformation", text: "You confirmed that 20 days was superseded by 25 days", where: "Staff leave policy", when: "2h ago" },
  { id: "a2", type: "misinformation", text: "You dismissed a possible conflict: 25 days vs 15 days (part-time)", where: "Staff leave policy", when: "2h ago" },
  { id: "a3", type: "bias", text: "Sherlock flagged a claim that rests on a single source", where: "Procurement guidelines 2024", when: "Yesterday" },
  { id: "a4", type: "system", text: "Scan finished: 64 documents read, 1 finding so far", where: "Grant program evaluation", when: "Yesterday" },
  { id: "a5", type: "disinformation", text: "A document no longer matches its fingerprint", where: "Regional office memo", when: "3 days ago" },
];

export interface SourceWatch {
  name: string;
  note: string;
  corroborated: number;
  review: number;
  superseded: number;
  single: number;
}

export const SOURCE_WATCH: SourceWatch[] = [
  { name: "Regional Office", note: "Mostly single-source claims", corroborated: 1, review: 1, superseded: 0, single: 5 },
  { name: "Intranet Team", note: "Only repeats other sources", corroborated: 0, review: 0, superseded: 3, single: 0 },
  { name: "Finance", note: "One figure depends on a superseded claim", corroborated: 2, review: 1, superseded: 0, single: 1 },
  { name: "HR Policy Office", note: "Original claims, one now superseded", corroborated: 3, review: 0, superseded: 1, single: 1 },
  { name: "Internal Audit", note: "Independent and consistent", corroborated: 6, review: 0, superseded: 0, single: 0 },
];
