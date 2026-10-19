/** Domain types shared by the server (scanner, database) and the UI. */

export type FindingType = "bias" | "misinformation" | "disinformation";
export type Severity = "high" | "medium" | "low";
export type FindingStatus = "open" | "confirmed" | "dismissed";

export type FindingKind =
  | "supersedes"
  | "depends-on"
  | "possible-conflict"
  | "contradicts-authority"
  | "unsourced"
  | "single-source"
  | "representation"
  | "echo"
  | "terminology"
  | "altered"
  | "citation"
  | "omission"
  | "coverage-gap"
  | "out-of-scope"
  | "ai-unreviewed"
  | "superseded-copy";

export interface SourceDoc {
  id: string;
  title: string;
  /** The agency or team that produced the document. */
  source: string;
  year: number;
  date?: string | null;
  docType?: string | null;
  docStatus?: string | null;
  sha256?: string;
  /** From the document's own front matter, when it has any. */
  recordStatus?: string | null;
  series?: string | null;
  version?: number | null;
  inAiScope?: boolean | null;
  aiGenerated?: boolean;
  custody?: string[];
  frontId?: string | null;
}

export type ClaimStatus = "corroborated" | "current" | "single" | "review" | "superseded";

export interface Claim {
  id: string;
  text: string;
  /** Document id of the earliest source. */
  origin: string;
  /** Document ids that state the claim. */
  citedBy: string[];
  status: ClaimStatus;
  attribute?: string;
  subject?: string;
  value?: string;
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
  isNew?: boolean;
  note?: string | null;
  decidedAt?: string | null;
  /** Second opinion from the AI scanner. Absent when the offline rules scanner was used. */
  aiReview?: AiReview | null;
}

export interface AiReview {
  verdict: "agree" | "disagree" | "unsure";
  rationale: string;
}

export type ScanStatus = "queued" | "running" | "complete" | "failed";

export interface ScanInfo {
  id: string;
  collectionId: string;
  collectionName: string;
  status: ScanStatus;
  provider: string;
  model: string | null;
  stage: string;
  progress: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  docCount: number;
  claimCount: number;
  findingCount: number;
}

export interface ScanEvent {
  id: number;
  at: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface ScanDocState {
  id: string;
  name: string;
  status: "queued" | "reading" | "done" | "error";
  title: string | null;
  source: string | null;
  claims: number;
  error: string | null;
  /** True when the facts came from an earlier scan of the same unchanged file. */
  reused?: boolean;
}

export interface ResultsPayload {
  collection: { id: string; name: string };
  scan: ScanInfo;
  docs: SourceDoc[];
  claims: Claim[];
  findings: Finding[];
}

export interface CollectionInfo {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  documentCount: number;
  latestScanId: string | null;
}

export interface ImportedDocument {
  id: string;
  collectionId: string;
  name: string;
  ext: string;
  size: number;
  sha256: string;
  uploadedAt: string;
}

export interface AuditEntry {
  id: number;
  at: string;
  actor: string;
  action: string;
  detail: string;
  hash: string;
  prevHash: string;
}

export interface AuditVerification {
  ok: boolean;
  entries: number;
  brokenAt: number | null;
}

export type InvestigationStatus = "needs-review" | "scanning" | "resolved" | "failed";

export interface DashboardPayload {
  last: null | {
    scanId: string;
    collectionId: string;
    name: string;
    documents: number;
    sources: number;
    lastWorked: string;
    reviewed: number;
    total: number;
    open: Record<FindingType, number>;
    next: null | {
      id: string;
      type: FindingType;
      title: string;
      summary: string;
      confidence: number;
      documents: number;
      evidence: { label: string; text: string; from: string }[];
    };
  };
  kpis: { openFindings: number; resolvedThisWeek: number; documents: number; agreement: number | null };
  trend: { labels: string[]; found: number[]; resolved: number[] };
  openByType: Record<FindingType, number>;
  investigations: {
    id: string;
    scanId: string | null;
    name: string;
    documents: number;
    status: InvestigationStatus;
    progress: number;
    open: number;
    lastActive: string;
  }[];
  activity: { id: string; type: FindingType | "system"; text: string; where: string; at: string }[];
  sourceWatch: { name: string; note: string; corroborated: number; review: number; superseded: number; single: number }[];
}

export interface ScanSummary {
  id: string;
  startedAt: string;
  status: ScanStatus;
  provider: string;
  docCount: number;
  claimCount: number;
  findingCount: number;
  newCount: number;
  openCount: number;
}
