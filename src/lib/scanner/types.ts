import { z } from "zod";
import type { AiReview, Evidence, FindingKind, FindingType, Severity } from "@/lib/types";

/** Controlled vocabulary the scanner uses so claims from different documents can be compared. */
export const ATTRIBUTES = [
  "retention_period", // how long records are kept before destruction, e.g. "10 years"
  "transfer_age", // age at which records move to the National Archives, e.g. "15 years"
  "access_period", // years before records open to public access, e.g. "20 years"
  "disposal_action", // e.g. "retain as national archives"
  "security_classification",
  "custodian",
  "other",
] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

/** These describe one rule for the whole collection, so the subject is ignored when grouping. */
export const GLOBAL_ATTRIBUTES: Attribute[] = ["access_period", "security_classification"];

export const ExtractedClaimSchema = z.object({
  subject: z.string().describe("What the statement is about, as a short noun phrase, e.g. 'grant application files'"),
  attribute: z.enum(ATTRIBUTES),
  value: z.string().describe("The stated value, e.g. '10 years' or '$412,000'"),
  quote: z.string().describe("The exact sentence from the document that states it"),
  effectiveFrom: z.string().nullable().describe("YYYY-MM-DD if the statement says when it takes effect, otherwise null"),
  basedOn: z
    .object({
      subject: z.string(),
      attribute: z.enum(ATTRIBUTES),
      value: z.string(),
    })
    .nullable()
    .describe("If this figure is calculated from or assumes another stated value, that value; otherwise null"),
});

export const ExtractedDocSchema = z.object({
  title: z.string(),
  producedBy: z.string().describe("The agency, team or unit that produced the document"),
  organisation: z.string().describe("The organisation that unit belongs to, e.g. 'DRIC' or 'NAA'"),
  date: z.string().nullable().describe("Document date as YYYY-MM-DD, or null"),
  docType: z.string().describe("e.g. Records Authority, Policy, Guide, FAQ, Register, Budget paper"),
  status: z.enum(["current", "draft", "superseded", "withdrawn", "unknown"]),
  refersTo: z.array(z.string()).describe("Titles of other documents this one says it is based on"),
  authorityNumbers: z.array(z.string()).describe("Every Records Authority number mentioned, e.g. 2024/00561247"),
  claims: z.array(ExtractedClaimSchema),
  languageFlags: z
    .array(z.object({ quote: z.string(), concern: z.string() }))
    .describe("Outdated, biased or harmful terminology, with the exact words and why they are a concern"),
});

export type ExtractedClaim = z.infer<typeof ExtractedClaimSchema>;
export type ExtractedDoc = z.infer<typeof ExtractedDocSchema>;

export const AiReviewSchema = z.object({
  verdict: z.enum(["agree", "disagree", "unsure"]),
  rationale: z.string().describe("One or two plain sentences, grounded only in the evidence provided"),
});

export const AssistSchema = z.object({
  recommendation: z.enum(["confirm", "dismiss", "needs_human"]),
  rationale: z.string(),
  suggestedAction: z.string().describe("What the information manager should do next"),
  draftNote: z.string().describe("A short note to record with the decision"),
});
export type Assistance = z.infer<typeof AssistSchema>;

export interface DocInput {
  id: string;
  name: string;
  ext: string;
  sha256: string;
  text: string | null;
  bytes: Buffer;
}

export interface CandidateFinding {
  type: FindingType;
  kind: FindingKind;
  title: string;
  summary: string;
  severity: Severity;
  confidence: number;
  evidence: Evidence[];
  docIds: string[];
  claimKeys: string[];
  fingerprint: string;
}

export interface ScanProvider {
  id: "gemini" | "rules" | "external";
  label: string;
  model: string | null;
  /** Rules mode is paced so the scanning screen is readable; AI mode is naturally slow. */
  paceMs: number;
  extract(doc: DocInput): Promise<ExtractedDoc & { warnings?: string[] }>;
  review(candidate: CandidateFinding, docTitles: Record<string, string>): Promise<AiReview | null>;
  assist(input: AssistInput): Promise<Assistance>;
}

export interface AssistInput {
  title: string;
  summary: string;
  kind: string;
  evidence: { label: string; doc?: string; quote: string }[];
  documents: string[];
  confidence: number;
}
