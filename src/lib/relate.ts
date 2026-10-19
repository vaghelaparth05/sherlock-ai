import { db, transaction } from "./db.ts";
import { allEntries, append } from "./ledger.ts";
import { scoringConfig, taxonomy } from "./config.ts";
import { authority, type ClaimFacts, type ClaimStatus } from "./scoring.ts";
import { structuredCall } from "./llm.ts";
import type { DocumentRow } from "./ingest.ts";
import type { ClaimRow } from "./extract.ts";

/**
 * Grouping, echo detection and conflict classification (COMPARE_V1).
 * Claims with the same subject and value form a group with one origin. Groups with
 * different values on one subject are classified once by the model and confirmed by a person.
 */

export const PROMPT_VERSION = "COMPARE_V1";
const ACTOR = "Sherlock";
export const RELATIONSHIP_TYPES = ["supersedes", "contradicts", "corrects", "different_scope"] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export interface Relationship {
  id: string;
  pair_key: string;
  from_claim_id: string;
  to_claim_id: string;
  type: RelationshipType;
  confidence: number;
  rationale: string;
  model: string;
  prompt_version: string;
  proposed_at: string;
}

export type Decision =
  | { status: "proposed" }
  | { status: "confirmed"; type: RelationshipType; actor: string; seq: number; reason: string | null }
  | { status: "dismissed"; actor: string; seq: number; reason: string | null };

export const groupKey = (c: { subject: string; value: string }) => `${c.subject}\u0000${c.value}`;
const pairKey = (subject: string, a: string, b: string) => [subject, ...[a, b].sort()].join("\u0000");
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Normalised Levenshtein similarity, 0 to 1. */
export function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (!x.length && !y.length) return 1;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length);
}

export interface GroupInfo {
  key: string;
  originId: string;
  /** The earlier claim this one copies, if any. */
  echoOf: string | null;
}

/** Origin = earliest claim from the highest-authority source. Echo = a later near-copy of an earlier claim. */
export function groupClaims(claims: ClaimRow[], docsById: Map<string, DocumentRow>): Map<string, GroupInfo> {
  const threshold = scoringConfig().echo_similarity;
  const doc = (c: ClaimRow) => docsById.get(c.document_id)!;
  const auth = (c: ClaimRow) => authority(doc(c).unit, doc(c).function);
  const byKey = new Map<string, ClaimRow[]>();
  for (const c of claims) byKey.set(groupKey(c), [...(byKey.get(groupKey(c)) ?? []), c]);

  const out = new Map<string, GroupInfo>();
  for (const [key, members] of byKey) {
    const origin = [...members].sort(
      (a, b) => auth(b) - auth(a) || doc(a).date.localeCompare(doc(b).date) || a.id.localeCompare(b.id),
    )[0];
    for (const c of members) {
      const source =
        c === origin
          ? undefined
          : [origin, ...members].find(
              (e) =>
                e.document_id !== c.document_id &&
                (doc(e).date < doc(c).date || (doc(e).date === doc(c).date && e.id < c.id)) &&
                similarity(e.quote, c.quote) >= threshold,
            );
      out.set(c.id, { key, originId: origin.id, echoOf: source?.id ?? null });
    }
  }
  return out;
}

const periodsOverlap = (a: ClaimRow, b: ClaimRow) =>
  !(a.effective_to && b.effective_from && a.effective_to < b.effective_from) &&
  !(b.effective_to && a.effective_from && b.effective_to < a.effective_from);

/** Origins of value groups on the same subject with different values and overlapping periods. */
export function candidatePairs(claims: ClaimRow[], groups: Map<string, GroupInfo>, docsById: Map<string, DocumentRow>) {
  const origins = claims.filter((c) => groups.get(c.id)!.originId === c.id && c.subject !== "other");
  const pairs: { pairKey: string; newer: ClaimRow; older: ClaimRow }[] = [];
  for (let i = 0; i < origins.length; i++) {
    for (let j = i + 1; j < origins.length; j++) {
      const [a, b] = [origins[i], origins[j]];
      if (a.subject !== b.subject || a.value === b.value || !periodsOverlap(a, b)) continue;
      const aLater = docsById.get(a.document_id)!.date > docsById.get(b.document_id)!.date || (docsById.get(a.document_id)!.date === docsById.get(b.document_id)!.date && a.id > b.id);
      pairs.push({ pairKey: pairKey(a.subject, a.value, b.value), newer: aLater ? a : b, older: aLater ? b : a });
    }
  }
  return pairs;
}

const SYSTEM = `You compare two claims from a government records collection. They are on the same subject but state different values. Decide how the newer claim relates to the older one:
- supersedes: the newer claim legitimately replaces the older rule, for example a new version or a recorded decision changed it.
- corrects: the newer claim says the older one was an error and fixes it.
- contradicts: both cannot be true for the same people and period, and the newer does not legitimately replace the older, for example it comes from an unofficial or unknown source or conflicts with a declared record.
- different_scope: both can be true, because they apply to different people, places or periods, or describe different things.
Judge only from the metadata and quotes given. Give a confidence from 0 to 1 and a rationale of at most two sentences.`;

const SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: [...RELATIONSHIP_TYPES] },
    confidence: { type: "number" },
    rationale: { type: "string" },
  },
  required: ["type", "confidence", "rationale"],
  additionalProperties: false,
};

function describe(label: string, c: ClaimRow, d: DocumentRow): string {
  return `${label} claim
document: ${d.id}, "${d.title}"
business unit: ${d.unit}; business function: ${d.function}; record status: ${d.record_status}
custody: ${JSON.parse(d.custody).join(" > ")}; date: ${d.date}
scope: ${c.scope}; effective: ${c.effective_from ?? "unstated"} to ${c.effective_to ?? "unstated"}
value: ${c.value}
quote: "${c.quote}"`;
}

/** Python-style checks from the spec. Returns why the model's answer is rejected, or null. */
export function checkClassification(type: RelationshipType, confidence: number, rationale: string, newer: DocumentRow, older: DocumentRow, newerQuote: string): string | null {
  if (!(confidence >= 0 && confidence <= 1)) return "Confidence must be between 0 and 1.";
  if (!rationale.trim() || rationale.length > 500) return "Rationale must be one or two sentences.";
  if (type === "supersedes") {
    if (!(newer.date > older.date)) return "supersedes needs the newer document to be later-dated.";
    if (authority(newer.unit, newer.function) < authority(older.unit, older.function)) {
      return "supersedes needs the newer document to be at least as authoritative.";
    }
  }
  if (type === "corrects" && !/\b(correct\w*|erratum|errors?|incorrect\w*|mistakes?|amend\w*)\b/i.test(newerQuote)) {
    return "corrects needs explicit correction wording in the quote.";
  }
  return null;
}

export function allRelationships(): Relationship[] {
  return db().prepare("SELECT * FROM relationships ORDER BY id").all() as unknown as Relationship[];
}

/** Latest CONFIRM, DISMISS or CHANGE_RELATIONSHIP per relationship. */
export function decisions(): Map<string, Decision> {
  const out = new Map<string, Decision>();
  for (const e of allEntries()) {
    if (e.target_type !== "relationship") continue;
    const base = { actor: e.actor, seq: e.seq, reason: e.reason };
    if (e.action === "CONFIRM" || e.action === "CHANGE_RELATIONSHIP") {
      out.set(e.target_id, { status: "confirmed", type: JSON.parse(e.payload_json).type, ...base });
    } else if (e.action === "DISMISS") {
      out.set(e.target_id, { status: "dismissed", ...base });
    }
  }
  return out;
}

/** Classifies every new value pair and records each as a proposal. Rejected classifications are returned, not stored. */
export async function relateAll(docs: DocumentRow[], claims: ClaimRow[]) {
  const docsById = new Map(docs.map((d) => [d.id, d]));
  const known = new Set(allRelationships().map((r) => r.pair_key));
  const pairs = candidatePairs(claims, groupClaims(claims, docsById), docsById).filter((p) => !known.has(p.pairKey));

  const results = await Promise.all(
    pairs.map(async (p) => {
      const newerDoc = docsById.get(p.newer.document_id)!;
      const olderDoc = docsById.get(p.older.document_id)!;
      const label = taxonomy().subjects[p.newer.subject]?.label ?? p.newer.subject;
      const r = await structuredCall<{ type: RelationshipType; confidence: number; rationale: string }>({
        promptVersion: PROMPT_VERSION,
        system: SYSTEM,
        user: `Subject: ${label}\n\n${describe("Older", p.older, olderDoc)}\n\n${describe("Newer", p.newer, newerDoc)}`,
        schema: SCHEMA,
        maxTokens: 4000,
      });
      const problem = checkClassification(r.output.type, r.output.confidence, r.output.rationale, newerDoc, olderDoc, p.newer.quote);
      return { pair: p, result: r, problem };
    }),
  );

  return transaction(() => {
    const proposed: Relationship[] = [];
    const rejected: { pairKey: string; newer: string; older: string; type: string; problem: string }[] = [];
    let n = allRelationships().length;
    for (const { pair, result, problem } of results) {
      if (problem) {
        rejected.push({ pairKey: pair.pairKey, newer: pair.newer.id, older: pair.older.id, type: result.output.type, problem });
        continue;
      }
      const rel: Relationship = {
        id: `R${String(++n).padStart(2, "0")}`,
        pair_key: pair.pairKey,
        from_claim_id: pair.newer.id,
        to_claim_id: pair.older.id,
        type: result.output.type,
        confidence: result.output.confidence,
        rationale: result.output.rationale.trim(),
        model: result.model,
        prompt_version: result.promptVersion,
        proposed_at: new Date().toISOString(),
      };
      const cols = Object.keys(rel) as (keyof Relationship)[];
      db()
        .prepare(`INSERT INTO relationships (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
        .run(...cols.map((c) => rel[c]));
      append({
        actor: ACTOR,
        action: "PROPOSE_RELATIONSHIP",
        targetType: "relationship",
        targetId: rel.id,
        payload: { from: rel.from_claim_id, to: rel.to_claim_id, type: rel.type, confidence: rel.confidence, model: rel.model, prompt_version: rel.prompt_version, cached: result.cached },
      });
      proposed.push(rel);
    }
    return { proposed, rejected };
  });
}

export class DecisionError extends Error {}

export function decide(id: string, decision: "confirm" | "dismiss" | "change", actor: string, reason: string | undefined, type?: RelationshipType) {
  const rel = allRelationships().find((r) => r.id === id);
  if (!rel) throw new DecisionError(`No relationship ${id}.`);
  if (decision === "change" && !(type && RELATIONSHIP_TYPES.includes(type))) {
    throw new DecisionError(`Changing a relationship needs a type: ${RELATIONSHIP_TYPES.join(", ")}.`);
  }
  const action = decision === "confirm" ? "CONFIRM" : decision === "dismiss" ? "DISMISS" : "CHANGE_RELATIONSHIP";
  return append({
    actor,
    action,
    targetType: "relationship",
    targetId: id,
    payload: { type: decision === "change" ? type : rel.type, from: rel.from_claim_id, to: rel.to_claim_id, proposed_type: rel.type },
    reason,
  });
}

export interface ClaimState extends ClaimFacts {
  originId: string;
  echoOf: string | null;
  /** The claim that superseded or corrected this one. */
  replacedBy: string | null;
  /** Current claims in declared records that this one conflicts with. */
  contradictedBy: string[];
  /** The contradiction is proposed with high confidence, not yet confirmed. */
  provisional: boolean;
}

/** Derives every claim's status from groups and confirmed (or high-confidence proposed) relationships. */
export function claimStates(
  claims: ClaimRow[],
  docsById: Map<string, DocumentRow>,
  relationships: Relationship[],
  decided: Map<string, Decision>,
): Map<string, ClaimState> {
  const groups = groupClaims(claims, docsById);
  const byId = new Map(claims.map((c) => [c.id, c]));
  const members = new Map<string, ClaimRow[]>();
  for (const c of claims) members.set(groupKey(c), [...(members.get(groupKey(c)) ?? []), c]);
  const doc = (c: ClaimRow) => docsById.get(c.document_id)!;
  const effective = relationships
    .map((r) => {
      const d = decided.get(r.id) ?? { status: "proposed" as const };
      if (d.status === "dismissed") return null;
      return { rel: r, type: d.status === "confirmed" ? d.type : r.type, confirmed: d.status === "confirmed" };
    })
    .filter((x) => x !== null);

  const replaced = new Map<string, { status: ClaimStatus; by: string }>();
  for (const { rel, type, confirmed } of effective) {
    if (!confirmed || (type !== "supersedes" && type !== "corrects")) continue;
    const loser = groupKey(byId.get(rel.to_claim_id)!);
    replaced.set(loser, { status: type === "supersedes" ? "superseded" : "corrected", by: rel.from_claim_id });
  }
  const isCurrent = (c: ClaimRow) => !replaced.has(groupKey(c));

  const contradicted = new Map<string, { by: string[]; confirmed: boolean }>();
  const threshold = scoringConfig().corroboration.provisional_confidence;
  for (const { rel, type, confirmed } of effective) {
    if (type !== "contradicts" || !(confirmed || rel.confidence >= threshold)) continue;
    const sides = [groupKey(byId.get(rel.from_claim_id)!), groupKey(byId.get(rel.to_claim_id)!)];
    for (const [mine, theirs] of [sides, [...sides].reverse()]) {
      const by = (members.get(theirs) ?? []).filter((o) => isCurrent(o) && doc(o).record_status === "declared").map((o) => o.id);
      if (!by.length) continue;
      const prior = contradicted.get(mine);
      contradicted.set(mine, { by: [...(prior?.by ?? []), ...by], confirmed: confirmed || Boolean(prior?.confirmed) });
    }
  }

  const out = new Map<string, ClaimState>();
  for (const c of claims) {
    const key = groupKey(c);
    const g = groups.get(c.id)!;
    const group = members.get(key)!;
    const fromRecords = group.filter((o) => doc(o).record_status !== "ai_generated");
    const rep = replaced.get(key);
    const con = contradicted.get(key);
    const units = new Set(
      fromRecords
        .filter((o) => o.document_id !== c.document_id && !groups.get(o.id)!.echoOf)
        .map((o) => doc(o).unit)
        .filter((u) => u !== doc(c).unit),
    );
    const unsupported = doc(c).record_status === "ai_generated" && fromRecords.length === 0;
    // An AI claim with no origin in a record shows as unsupported even when also contradicted.
    const status: ClaimStatus = rep ? rep.status : unsupported ? "unsupported" : con?.confirmed ? "disputed" : "current";
    out.set(c.id, {
      id: c.id,
      status,
      supersededChanged: Boolean(rep),
      contradicted: Boolean(con),
      agreements: units.size,
      originId: g.originId,
      echoOf: g.echoOf,
      replacedBy: rep?.by ?? null,
      contradictedBy: con ? [...new Set(con.by)] : [],
      provisional: Boolean(con && !con.confirmed),
    });
  }
  return out;
}
