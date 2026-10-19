import { readFileSync } from "node:fs";
import { db, transaction } from "./db.ts";
import { sha256 } from "./hash.ts";
import { allEntries, append, entriesFor, type LedgerEntry } from "./ledger.ts";
import { allDocuments, getDocument, type DocumentRow } from "./ingest.ts";
import { allClaims, claimsFor, type ClaimRow } from "./extract.ts";
import { taxonomy } from "./config.ts";
import { scoreDocument, type ClaimFacts, type DocFacts, type DocumentScore } from "./scoring.ts";
import { decideGate, type GateDecision, type Override } from "./gate.ts";

/**
 * The risk register: recomputes every document's score and gate from documents, claims
 * and the ledger, and serves the rows the Register and Document detail screens show.
 */

const today = () => new Date().toISOString().slice(0, 10);

function currentHash(doc: DocumentRow): string {
  try {
    return sha256(readFileSync(doc.source_path));
  } catch {
    return "missing";
  }
}

/** Re-hashes the source file. Logs TAMPER_DETECTED once per observed hash. */
function checkTamper(doc: DocumentRow): boolean {
  const observed = currentHash(doc);
  if (observed === doc.sha256) return false;
  const seen = entriesFor(doc.id, "TAMPER_DETECTED").some((e) => JSON.parse(e.payload_json).observed === observed);
  if (!seen) {
    append({
      actor: "Sherlock",
      action: "TAMPER_DETECTED",
      targetType: "document",
      targetId: doc.id,
      payload: { expected: doc.sha256, observed, source_path: doc.source_path },
    });
  }
  return true;
}

function laterDeclaredVersion(doc: DocumentRow, docs: DocumentRow[]): boolean {
  if (!doc.series || doc.version === null) return false;
  return docs.some(
    (d) => d.series === doc.series && d.version !== null && d.version > doc.version! && d.record_status === "declared",
  );
}

// ponytail: until relationships land (P1) no claim is superseded or contradicted, and echoes are not yet detected.
function claimFacts(doc: DocumentRow, claims: ClaimRow[], docsById: Map<string, DocumentRow>): ClaimFacts[] {
  return claims
    .filter((c) => c.document_id === doc.id)
    .map((c) => {
      const sameValue = claims.filter((o) => o.document_id !== doc.id && o.subject === c.subject && o.value === c.value);
      const fromRecords = sameValue.filter((o) => docsById.get(o.document_id)!.record_status !== "ai_generated");
      const units = new Set(
        fromRecords.filter((o) => !o.is_echo).map((o) => docsById.get(o.document_id)!.unit).filter((u) => u !== doc.unit),
      );
      const unsupported = doc.record_status === "ai_generated" && fromRecords.length === 0;
      return {
        id: c.id,
        status: unsupported ? "unsupported" : "current",
        supersededChanged: false,
        contradicted: false,
        agreements: units.size,
      };
    });
}

function overridesFor(id: string): Override[] {
  return entriesFor(id, "GATE_OVERRIDE").map((e) => ({
    actor: e.actor,
    reason: e.reason ?? "",
    seq: e.seq,
    rule: JSON.parse(e.payload_json).rule,
  }));
}

interface ScoreDetail {
  score: DocumentScore | null;
  gate: GateDecision;
  claims: ClaimFacts[];
}

export function rescoreAll(): void {
  const docs = allDocuments();
  const claims = allClaims();
  const docsById = new Map(docs.map((d) => [d.id, d]));
  const extracted = new Set(allEntries().filter((e) => e.action === "EXTRACT").map((e) => e.target_id));
  const now = new Date().toISOString();

  transaction(() => {
    for (const doc of docs) {
      const facts: DocFacts = {
        unit: doc.unit,
        function: doc.function,
        custody: JSON.parse(doc.custody),
        recordStatus: doc.record_status,
        reviewDate: doc.review_date,
        laterDeclaredVersion: laterDeclaredVersion(doc, docs),
        tampered: checkTamper(doc),
      };
      const cf = claimFacts(doc, claims, docsById);
      const scored = extracted.has(doc.id);
      const score = scored ? scoreDocument(facts, cf, today()) : null;
      const gate = decideGate({
        scored,
        tampered: facts.tampered,
        laterDeclaredVersion: facts.laterDeclaredVersion,
        claims: cf,
        band: score?.band ?? null,
        overrides: overridesFor(doc.id),
      });
      const detail: ScoreDetail = { score, gate, claims: cf };
      db()
        .prepare(
          `INSERT OR REPLACE INTO scores
           (document_id, provenance, currency, corroboration, integrity, trust, likelihood, consequence, risk, band, gate, detail_json, computed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          doc.id,
          score?.provenance.score ?? null,
          score?.currency.score ?? null,
          score?.corroboration.score ?? null,
          score?.integrity.score ?? null,
          score?.trust ?? null,
          score?.likelihood.level ?? null,
          score?.consequence ?? null,
          score?.risk ?? null,
          score?.band ?? null,
          gate.status,
          JSON.stringify(detail),
          now,
        );
    }
  });
}

interface ScoreRow {
  document_id: string;
  trust: number | null;
  likelihood: number | null;
  consequence: number | null;
  risk: number | null;
  band: string | null;
  gate: GateDecision["status"];
  detail_json: string;
  computed_at: string;
}

function scoreRow(id: string): ScoreRow | undefined {
  return db().prepare("SELECT * FROM scores WHERE document_id = ?").get(id) as ScoreRow | undefined;
}

function summary(doc: DocumentRow, s: ScoreRow | undefined) {
  const detail = s ? (JSON.parse(s.detail_json) as ScoreDetail) : null;
  return {
    id: doc.id,
    title: doc.title,
    unit: doc.unit,
    region: taxonomy().regions[doc.region]?.name ?? "Unknown",
    function: doc.function,
    custody: JSON.parse(doc.custody) as string[],
    recordStatus: doc.record_status,
    date: doc.date,
    inAiScope: doc.in_ai_scope_initial === 1,
    trust: s?.trust ?? null,
    likelihood: s?.likelihood ?? null,
    consequence: s?.consequence ?? null,
    risk: s?.risk ?? null,
    band: s?.band ?? null,
    gate: s?.gate ?? "quarantined",
    gateReason: detail?.gate.reason ?? "Not yet scored.",
    overridden: Boolean(detail?.gate.override),
  };
}

export type RegisterRow = ReturnType<typeof summary>;

export function registerRows(): RegisterRow[] {
  return allDocuments().map((d) => summary(d, scoreRow(d.id)));
}

export function documentDetail(id: string) {
  const doc = getDocument(id);
  if (!doc) return null;
  const s = scoreRow(id);
  const detail = s ? (JSON.parse(s.detail_json) as ScoreDetail) : null;
  const facts = new Map(detail?.claims.map((c) => [c.id, c]));
  const claims = claimsFor(id).map((c) => ({
    id: c.id,
    subject: c.subject,
    statement: c.statement,
    value: c.value,
    scope: c.scope,
    effectiveFrom: c.effective_from,
    effectiveTo: c.effective_to,
    quote: c.quote,
    location: c.location,
    status: facts.get(c.id)?.status ?? "current",
    agreements: facts.get(c.id)?.agreements ?? 0,
    corroboration: detail?.score?.corroboration.perClaim[c.id] ?? null,
    model: c.model,
    promptVersion: c.prompt_version,
  }));
  const claimIds = new Set(claims.map((c) => c.id));
  const ledger: LedgerEntry[] = allEntries().filter((e) => e.target_id === id || claimIds.has(e.target_id));
  return {
    ...summary(doc, s),
    creator: doc.creator,
    series: doc.series,
    version: doc.version,
    reviewDate: doc.review_date,
    cites: JSON.parse(doc.cites) as string[],
    sha256: doc.sha256,
    ingestedAt: doc.ingested_at,
    text: doc.text,
    score: detail?.score ?? null,
    gateDecision: detail?.gate ?? null,
    computedAt: s?.computed_at ?? null,
    claims,
    ledger,
  };
}

export class GateOverrideError extends Error {}

/** A person allows a blocked document. The override applies only to the rule it was written against. */
export function overrideGate(id: string, actor: string, reason: string) {
  const s = scoreRow(id);
  if (!s) throw new GateOverrideError(`No document ${id}.`);
  const gate = (JSON.parse(s.detail_json) as ScoreDetail).gate;
  if (gate.status !== "blocked") throw new GateOverrideError(`${id} is ${gate.status}, not blocked.`);
  append({
    actor,
    action: "GATE_OVERRIDE",
    targetType: "document",
    targetId: id,
    payload: { from: "blocked", to: "allowed", rule: gate.rule, blocked_reason: gate.reason },
    reason,
  });
  rescoreAll();
  return documentDetail(id);
}
