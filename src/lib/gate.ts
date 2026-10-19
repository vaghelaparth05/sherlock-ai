import { scoringConfig } from "./config.ts";
import type { ClaimFacts } from "./scoring.ts";

/** Gate rules, applied in order. A person may override any block with a written reason. */

export type GateStatus = "allowed" | "blocked" | "quarantined";

export interface GateInput {
  scored: boolean;
  tampered: boolean;
  laterDeclaredVersion: boolean;
  claims: ClaimFacts[];
  band: string | null;
  /** GATE_OVERRIDE entries for this document. One applies only to the rule it was written against. */
  overrides: Override[];
}

export interface Override {
  actor: string;
  reason: string;
  seq: number;
  rule: number;
}

export interface GateDecision {
  status: GateStatus;
  rule: number;
  reason: string;
  override?: Override;
}

/** Claims that keep a document blocked until corrected. */
export function blockingClaims(claims: ClaimFacts[]): ClaimFacts[] {
  return claims.filter((c) => c.supersededChanged || c.contradicted || c.status === "unsupported");
}

function blockReason(i: GateInput): { rule: number; reason: string } | null {
  if (i.tampered) return { rule: 2, reason: "Integrity failure: the file no longer matches the hash recorded at ingest." };
  if (i.laterDeclaredVersion) return { rule: 3, reason: "A later declared version exists in this series. Kept for history, never served as current." };
  const bad = blockingClaims(i.claims);
  if (bad.length) {
    return { rule: 4, reason: `${bad.map((c) => c.id).join(", ")}: superseded with a changed value, contradicted or unsupported.` };
  }
  if (i.band && scoringConfig().blocked_bands.includes(i.band)) return { rule: 5, reason: `Risk is ${i.band}.` };
  return null;
}

export function decideGate(i: GateInput): GateDecision {
  if (!i.scored) return { status: "quarantined", rule: 1, reason: "Not yet scored." };
  const block = blockReason(i);
  if (!block) return { status: "allowed", rule: 6, reason: "Passes every gate rule." };
  const override = i.overrides.filter((o) => o.rule === block.rule).at(-1);
  if (override) return { status: "allowed", ...block, override };
  return { status: "blocked", ...block };
}
