import { scoringConfig, taxonomy } from "./config.ts";
import type { RecordStatus } from "./ingest.ts";

/**
 * Trust, likelihood, consequence and risk. Pure functions, no model calls.
 * Every weight, lookup and band comes from config/scoring.yaml.
 */

const oneDecimal = (n: number) => Math.round(n * 10) / 10;

export type ClaimStatus = "current" | "superseded" | "corrected" | "disputed" | "unsupported";

export interface DocFacts {
  unit: string;
  function: string;
  custody: string[];
  recordStatus: RecordStatus;
  reviewDate: string | null;
  /** A later declared version exists in the same series. */
  laterDeclaredVersion: boolean;
  /** The file on disk no longer matches the hash recorded at ingest. */
  tampered: boolean;
}

export interface ClaimFacts {
  id: string;
  status: ClaimStatus;
  /** Superseded by a claim with a different value. */
  supersededChanged: boolean;
  /** Contradicted by a current claim in a declared record (confirmed, or provisional at high confidence). */
  contradicted: boolean;
  /** Distinct other business units stating the same value, echoes excluded. */
  agreements: number;
}

export interface DocumentScore {
  provenance: { score: number; authority: number; custody: number };
  currency: { score: number; base: number; supersededShare: number; laterDeclaredVersion: boolean };
  corroboration: { score: number; perClaim: Record<string, number | null> };
  integrity: { score: number; tampered: boolean };
  trust: number;
  likelihood: { level: number; label: string };
  consequence: number;
  risk: number;
  band: string;
}

export function authority(unit: string, fn: string): number {
  const a = scoringConfig().authority;
  const f = taxonomy().functions[fn];
  if (f?.owner === unit) return a.owner;
  if (f?.related.includes(unit)) return a.related;
  return a.other;
}

/** Weakest link in the custody chain. */
export function custody(chain: string[]): number {
  const table = scoringConfig().custody;
  return Math.min(...chain.map((c) => table[c] ?? 0));
}

export function provenance(doc: DocFacts): DocumentScore["provenance"] {
  const a = authority(doc.unit, doc.function);
  const c = custody(doc.custody);
  return { score: (a + c) / 2, authority: a, custody: c };
}

export function currency(doc: DocFacts, claims: ClaimFacts[], today: string): DocumentScore["currency"] {
  const cfg = scoringConfig().currency;
  const supersededShare = claims.length ? claims.filter((c) => c.supersededChanged).length / claims.length : 0;
  if (doc.laterDeclaredVersion) {
    return { score: cfg.later_declared_version, base: cfg.later_declared_version, supersededShare, laterDeclaredVersion: true };
  }
  const base = doc.reviewDate && doc.reviewDate >= today ? cfg.review_current : cfg.review_missing_or_passed;
  return { score: oneDecimal(base * (1 - cfg.superseded_penalty * supersededShare)), base, supersededShare, laterDeclaredVersion: false };
}

/** Null when the claim is superseded with a changed value: Currency already counts it. */
export function claimCorroboration(c: ClaimFacts): number | null {
  const cfg = scoringConfig().corroboration;
  if (c.contradicted) return cfg.contradicted;
  if (c.status === "unsupported") return cfg.unsupported;
  if (c.supersededChanged) return null;
  if (c.agreements >= 2) return cfg.two_or_more;
  if (c.agreements === 1) return cfg.one;
  return cfg.none;
}

export function corroboration(claims: ClaimFacts[]): DocumentScore["corroboration"] {
  const perClaim = Object.fromEntries(claims.map((c) => [c.id, claimCorroboration(c)]));
  const counted = Object.values(perClaim).filter((v): v is number => v !== null);
  // ponytail: a document with no countable claims scores as single-source; revisit if the IM team wants a separate rule.
  const score = counted.length ? counted.reduce((a, b) => a + b, 0) / counted.length : scoringConfig().corroboration.none;
  return { score: oneDecimal(score), perClaim };
}

export function integrity(doc: DocFacts): DocumentScore["integrity"] {
  const table = scoringConfig().integrity;
  if (doc.tampered) return { score: table.tampered, tampered: true };
  return { score: table[doc.recordStatus] ?? table.unknown, tampered: false };
}

export function likelihood(trust: number): DocumentScore["likelihood"] {
  const band = scoringConfig().likelihood.find((b) => trust >= b.min)!;
  return { level: band.level, label: band.label };
}

export function consequence(fn: string): number {
  return taxonomy().functions[fn].consequence;
}

export function riskBand(risk: number): string {
  return scoringConfig().risk_bands.find((b) => risk <= b.max)!.band;
}

export function scoreDocument(doc: DocFacts, claims: ClaimFacts[], today: string): DocumentScore {
  const w = scoringConfig().weights;
  const p = provenance(doc);
  const cu = currency(doc, claims, today);
  const co = corroboration(claims);
  const i = integrity(doc);
  const trust = Math.round(w.provenance * p.score + w.currency * cu.score + w.corroboration * co.score + w.integrity * i.score);
  const c = consequence(doc.function);
  // An integrity failure overrides the matrix: the content cannot be relied on at all.
  const l = i.tampered ? { level: 5, label: "Almost certain" } : likelihood(trust);
  const risk = i.tampered ? 25 : l.level * c;
  return { provenance: p, currency: cu, corroboration: co, integrity: i, trust, likelihood: l, consequence: c, risk, band: riskBand(risk) };
}
