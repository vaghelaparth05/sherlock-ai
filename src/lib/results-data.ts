/**
 * SAMPLE scan output for the results screen.
 * The UI derives every count, chart and source record from these arrays (see results-derive.ts),
 * so replacing this file with real scan output should not require touching the components.
 */

export type FindingType = "bias" | "misinformation" | "disinformation";
export type Severity = "high" | "medium" | "low";
export type FindingStatus = "open" | "confirmed" | "dismissed";

export type FindingKind =
  | "supersedes"
  | "depends-on"
  | "possible-conflict"
  | "unsourced"
  | "drift"
  | "duplicate"
  | "single-source"
  | "representation"
  | "echo"
  | "provenance"
  | "altered"
  | "citation"
  | "metadata";

export const KIND_LABEL: Record<FindingKind, string> = {
  supersedes: "Superseded",
  "depends-on": "Depends on old claim",
  "possible-conflict": "Possible conflict",
  unsourced: "No source cited",
  drift: "Wording drift",
  duplicate: "Consistent repeat",
  "single-source": "Single source",
  representation: "Under-represented",
  echo: "Only repeats others",
  provenance: "Provenance",
  altered: "Altered after upload",
  citation: "Bad citation",
  metadata: "Metadata oddity",
};

export interface SourceDoc {
  id: string;
  title: string;
  source: string;
  year: number;
}

export type ClaimStatus = "corroborated" | "current" | "single" | "review" | "superseded";

export interface Claim {
  id: string;
  text: string;
  origin: string; // document id of the earliest source
  citedBy: string[]; // document ids that state it
  status: ClaimStatus;
}

export interface Evidence {
  label: string;
  docId?: string;
  /** Wrap the decisive words in [[double brackets]] to highlight them. */
  quote: string;
  mono?: boolean;
}

export interface Finding {
  id: string;
  type: FindingType;
  kind: FindingKind;
  title: string;
  summary: string;
  severity: Severity;
  confidence: number;
  status: FindingStatus;
  evidence: Evidence[];
  docIds: string[];
  claimIds: string[];
}

export const COLLECTION = {
  name: "Staff leave policy",
  scannedAt: "Scan finished 2 hours ago",
};

export const DOCS: SourceDoc[] = [
  { id: "D1", title: "Leave Policy v2", source: "HR Policy Office", year: 2022 },
  { id: "D2", title: "Staff Handbook 2022", source: "Staff Handbook Team", year: 2022 },
  { id: "D3", title: "Intranet leave FAQ", source: "Intranet Team", year: 2023 },
  { id: "D4", title: "Onboarding pack", source: "HR Policy Office", year: 2023 },
  { id: "D5", title: "Manager guide", source: "Staff Handbook Team", year: 2023 },
  { id: "D6", title: "Annual report 2023", source: "Corporate Affairs", year: 2023 },
  { id: "D7", title: "Casual staff guide", source: "HR Policy Office", year: 2023 },
  { id: "D8", title: "Payroll manual", source: "Payroll Office", year: 2024 },
  { id: "D9", title: "Budget paper 2024", source: "Finance", year: 2024 },
  { id: "D10", title: "Internal audit report", source: "Internal Audit", year: 2024 },
  { id: "D11", title: "Regional office memo", source: "Regional Office", year: 2024 },
  { id: "D12", title: "Leave Policy v3 (signed)", source: "Executive Office", year: 2026 },
];

export const CLAIMS: Claim[] = [
  { id: "K1", text: "Annual leave is 20 days (full-time staff)", origin: "D1", citedBy: ["D1", "D2", "D3", "D4", "D5", "D6"], status: "superseded" },
  { id: "K2", text: "Leave carry-over is capped at 10 days", origin: "D1", citedBy: ["D1", "D2", "D5", "D12"], status: "corroborated" },
  { id: "K3", text: "Sick leave is 10 days per year", origin: "D8", citedBy: ["D3", "D8", "D10"], status: "corroborated" },
  { id: "K4", text: "Casual staff receive no paid annual leave", origin: "D7", citedBy: ["D7"], status: "single" },
  { id: "K5", text: "Part-time staff accrue 15 days of annual leave", origin: "D11", citedBy: ["D11"], status: "review" },
  { id: "K6", text: "Annual leave liability is $2.4m", origin: "D9", citedBy: ["D9"], status: "review" },
  { id: "K7", text: "Annual leave is 25 days from 1 July 2026", origin: "D12", citedBy: ["D12"], status: "current" },
];

export const FINDINGS: Finding[] = [
  // ---- Misinformation ----
  {
    id: "M1", type: "misinformation", kind: "supersedes", severity: "high", confidence: 94, status: "open",
    title: "“Annual leave is 20 days” is out of date",
    summary: "A signed policy sets 25 days from 1 July 2026. Six documents still state 20 days, and all of them trace back to one original.",
    evidence: [
      { label: "Older", docId: "D1", quote: "Full-time staff are entitled to [[20 days]] of annual leave each year." },
      { label: "Newer", docId: "D12", quote: "From 1 July 2026, full-time staff are entitled to [[25 days]] of annual leave each year." },
    ],
    docIds: ["D1", "D2", "D3", "D4", "D5", "D6"], claimIds: ["K1", "K7"],
  },
  {
    id: "M2", type: "misinformation", kind: "depends-on", severity: "medium", confidence: 88, status: "open",
    title: "The budget liability is built on the old figure",
    summary: "The $2.4m leave liability assumes 20 days per employee, so it needs recalculating once the new entitlement applies.",
    evidence: [
      { label: "Depends on", docId: "D9", quote: "The annual leave liability is estimated at [[$2.4m]], based on [[20 days]] per full-time employee." },
      { label: "Newer", docId: "D12", quote: "full-time staff are entitled to [[25 days]] of annual leave each year." },
    ],
    docIds: ["D9"], claimIds: ["K6", "K1"],
  },
  {
    id: "M3", type: "misinformation", kind: "possible-conflict", severity: "low", confidence: 58, status: "open",
    title: "25 days versus 15 days: the same subject?",
    summary: "A regional memo gives part-time staff 15 days. Sherlock cannot tell whether this describes a different staff type, so it needs a person.",
    evidence: [
      { label: "Memo", docId: "D11", quote: "[[Part-time]] staff accrue [[15 days]] of annual leave per year, pro rata." },
      { label: "Policy", docId: "D12", quote: "[[full-time]] staff are entitled to [[25 days]] of annual leave each year." },
    ],
    docIds: ["D11", "D12"], claimIds: ["K5", "K7"],
  },
  {
    id: "M4", type: "misinformation", kind: "possible-conflict", severity: "low", confidence: 52, status: "dismissed",
    title: "Casual staff versus the 20-day entitlement",
    summary: "Casual employees get no paid leave, which looks like a conflict but covers a different staff type.",
    evidence: [
      { label: "Casual guide", docId: "D7", quote: "[[Casual]] employees do not receive paid annual leave." },
      { label: "Policy", docId: "D1", quote: "[[Full-time]] staff are entitled to 20 days of annual leave each year." },
    ],
    docIds: ["D7", "D1"], claimIds: ["K4", "K1"],
  },
  {
    id: "M5", type: "misinformation", kind: "unsourced", severity: "medium", confidence: 76, status: "confirmed",
    title: "The annual report repeats 20 days without a source",
    summary: "The figure appears with no citation, so readers cannot check where it came from.",
    evidence: [{ label: "Report", docId: "D6", quote: "Staff are entitled to [[20 days]] of annual leave." }],
    docIds: ["D6"], claimIds: ["K1"],
  },
  {
    id: "M6", type: "misinformation", kind: "drift", severity: "low", confidence: 63, status: "confirmed",
    title: "The manager guide paraphrases the policy loosely",
    summary: "“Up to 20 days” is not the same as an entitlement of 20 days.",
    evidence: [
      { label: "Guide", docId: "D5", quote: "Managers should approve [[up to 20 days]] of annual leave per person." },
      { label: "Policy", docId: "D1", quote: "Full-time staff are [[entitled to 20 days]] of annual leave each year." },
    ],
    docIds: ["D5", "D1"], claimIds: ["K1"],
  },
  {
    id: "M7", type: "misinformation", kind: "duplicate", severity: "low", confidence: 49, status: "dismissed",
    title: "The carry-over cap appears in three documents",
    summary: "Consistent repetition from one source, not a conflict.",
    evidence: [{ label: "Policy", docId: "D1", quote: "Unused leave may be carried over to a maximum of [[10 days]]." }],
    docIds: ["D1", "D2", "D5"], claimIds: ["K2"],
  },

  // ---- Bias ----
  {
    id: "B1", type: "bias", kind: "single-source", severity: "medium", confidence: 91, status: "open",
    title: "The annual leave figure rests on one original source",
    summary: "Six documents repeat it, but every one traces to Leave Policy v2. It counts as one source, not six.",
    evidence: [{ label: "Origin", docId: "D1", quote: "Full-time staff are entitled to [[20 days]] of annual leave each year." }],
    docIds: ["D1", "D2", "D3", "D4", "D5", "D6"], claimIds: ["K1"],
  },
  {
    id: "B2", type: "bias", kind: "representation", severity: "medium", confidence: 72, status: "open",
    title: "Part-time and casual staff are barely represented",
    summary: "Only 2 of 12 documents describe staff other than full-time employees, so the collection leans toward one group.",
    evidence: [
      { label: "Casual", docId: "D7", quote: "[[Casual]] employees do not receive paid annual leave." },
      { label: "Part-time", docId: "D11", quote: "[[Part-time]] staff accrue 15 days of annual leave per year." },
    ],
    docIds: ["D7", "D11"], claimIds: ["K4", "K5"],
  },
  {
    id: "B3", type: "bias", kind: "echo", severity: "low", confidence: 80, status: "confirmed",
    title: "Two teams only repeat other sources",
    summary: "Staff Handbook Team and Intranet Team have not introduced any original claims.",
    evidence: [{ label: "Handbook", docId: "D2", quote: "Annual leave: [[20 days]] per year for full-time employees." }],
    docIds: ["D2", "D3", "D5"], claimIds: ["K1"],
  },
  {
    id: "B4", type: "bias", kind: "provenance", severity: "low", confidence: 61, status: "dismissed",
    title: "Sick leave evidence comes from administrative sources",
    summary: "The figure is confirmed by an independent audit, so the concern was dismissed.",
    evidence: [{ label: "Audit", docId: "D10", quote: "We confirmed payroll records show a sick leave entitlement of [[10 days]] per year." }],
    docIds: ["D8", "D10"], claimIds: ["K3"],
  },

  // ---- Disinformation ----
  {
    id: "D1", type: "disinformation", kind: "altered", severity: "high", confidence: 99, status: "open",
    title: "The regional office memo no longer matches its fingerprint",
    summary: "The file's SHA-256 changed after upload. Someone edited it, or the file was replaced.",
    evidence: [
      { label: "At upload", quote: "9f2c71ab04d8…e5a41ab0", mono: true },
      { label: "Now", quote: "e07d9c3b61f2…b8c3b81a", mono: true },
    ],
    docIds: ["D11"], claimIds: ["K5"],
  },
  {
    id: "D2", type: "disinformation", kind: "citation", severity: "high", confidence: 83, status: "confirmed",
    title: "The memo cites a policy reference that does not exist",
    summary: "Reference HR-2024-17 is not in the HR register.",
    evidence: [{ label: "Memo", docId: "D11", quote: "as set out in policy [[HR-2024-17]]" }],
    docIds: ["D11"], claimIds: ["K5"],
  },
  {
    id: "D3", type: "disinformation", kind: "metadata", severity: "low", confidence: 45, status: "dismissed",
    title: "The annual report was saved after its stated date",
    summary: "A normal export step explains the later date.",
    evidence: [{ label: "Metadata", docId: "D6", quote: "Created [[Mar 2024]], last saved [[Jun 2024]]" }],
    docIds: ["D6"], claimIds: [],
  },
  {
    id: "D4", type: "disinformation", kind: "metadata", severity: "low", confidence: 42, status: "dismissed",
    title: "The budget paper author differs from its owner",
    summary: "The author is a contractor who prepared it for Finance.",
    evidence: [{ label: "Metadata", docId: "D9", quote: "Author: [[J. Park]] · Owner: [[Finance]]" }],
    docIds: ["D9"], claimIds: [],
  },
];
