import { z } from "zod";
import type { AiReview, Evidence, FindingKind, FindingType, Severity } from "@/lib/types";

/**
 * Names the scanner prefers for facts that different documents repeat or contradict. A scanner may
 * invent another snake_case name when none fits; the engine maps common synonyms back to these.
 */
export const KNOWN_ATTRIBUTES = [
  // recordkeeping
  "retention_period", // how long records are kept before destruction, e.g. "10 years"
  "transfer_age", // age at which records move to the National Archives, e.g. "15 years"
  "access_period", // years before records open to public access, e.g. "20 years"
  "disposal_action", // e.g. "retain as national archives"
  "security_classification",
  "custodian",
  // programs and services
  "income_threshold", // e.g. "$120,000"
  "payment_amount", // every amount stated, e.g. "$2,000, $5,000, $10,000"
  "application_deadline", // e.g. "31 October 2026"
  "application_fee", // "none" or an amount
  "payment_method", // e.g. "electronic funds transfer to applicant's own account"
  "tenure_requirement", // e.g. "owner-occupiers only"
  "proof_of_address_requirement", // e.g. "utility bill or lease"
  "eligibility_conditions", // every condition in one list, separated by "; "
  "other",
] as const;
/** Free-form on purpose: a scanner can name any fact two documents might disagree about. */
export type Attribute = string;
export const ATTRIBUTES = KNOWN_ATTRIBUTES;

/** These describe one rule for the whole collection, so the subject is ignored when grouping. */
export const GLOBAL_ATTRIBUTES: string[] = [
  "access_period",
  "security_classification",
  "income_threshold",
  "payment_amount",
  "application_deadline",
  "application_fee",
  "payment_method",
  "tenure_requirement",
  "proof_of_address_requirement",
];

export const ExtractedClaimSchema = z.object({
  subject: z.string().describe("What the statement is about, as a short noun phrase, e.g. 'grant application files'"),
  attribute: z.string().describe("The kind of fact, as a snake_case name. Prefer one of the known names."),
  value: z.string().describe("The stated value, e.g. '10 years', '$412,000' or '31 October 2026'"),
  quote: z.string().describe("The exact sentence from the document that states it"),
  effectiveFrom: z.string().nullable().describe("YYYY-MM-DD if the statement says when it takes effect, otherwise null"),
  appliesTo: z
    .string()
    .nullable()
    .optional()
    .describe("Only if the statement is an exception or applies to a narrower group than everyone (for example 'remote communities'); otherwise null"),
  basedOn: z
    .object({
      subject: z.string(),
      attribute: z.string(),
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
  aiGenerated: z.boolean().optional().describe("True only if the document itself says an AI wrote or summarised it"),
  refersTo: z.array(z.string()).describe("Titles of other documents this one says it is based on"),
  authorityNumbers: z.array(z.string()).describe("Every Records Authority number mentioned, e.g. 2024/00561247"),
  claims: z.array(ExtractedClaimSchema),
  languageFlags: z
    .array(z.object({ quote: z.string(), concern: z.string() }))
    .describe("Outdated, biased or harmful terminology, with the exact words and why they are a concern"),
});

/** Facts read from a document's own front matter by code (never by the AI). */
export interface DocMeta {
  frontId?: string | null;
  series?: string | null;
  version?: number | null;
  recordStatus?: string | null;
  inAiScope?: boolean | null;
  custody?: string[];
  cites?: string[];
}

export type ExtractedClaim = z.infer<typeof ExtractedClaimSchema>;
export type ExtractedDoc = z.infer<typeof ExtractedDocSchema> & DocMeta;

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
