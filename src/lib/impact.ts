import { db } from "./db.ts";
import { allEntries, append } from "./ledger.ts";
import { taxonomy } from "./config.ts";
import { claimStates, groupKey, type ClaimState, type Decision, type RelationshipType } from "./relate.ts";
import { snapshot } from "./register.ts";

/**
 * Impact and recall. A relationship's impact is the set of claims it marks superseded,
 * corrected or contradicted, the documents holding them, and the logged AI answers that cited them.
 */

export interface AnswerRow {
  id: string;
  ts_utc: string;
  staff_id: string;
  question: string;
  answer_json: string;
  cited_claim_ids: string; // JSON array
}

export function allAnswers(): AnswerRow[] {
  return db().prepare("SELECT * FROM ai_answers ORDER BY ts_utc").all() as unknown as AnswerRow[];
}

export function logAnswer(a: AnswerRow): void {
  db()
    .prepare("INSERT INTO ai_answers (id, ts_utc, staff_id, question, answer_json, cited_claim_ids) VALUES (?, ?, ?, ?, ?, ?)")
    .run(a.id, a.ts_utc, a.staff_id, a.question, a.answer_json, a.cited_claim_ids);
}

const hit = (s: ClaimState) => s.supersededChanged || s.contradicted;
const PLACEHOLDER = { actor: "", seq: 0, reason: null };

export function impactOfRelationship(relId: string, asType?: RelationshipType) {
  const snap = snapshot();
  const rel = snap.relationships.find((r) => r.id === relId);
  if (!rel) return null;
  const current = snap.decided.get(relId);
  const type = asType ?? (current?.status === "confirmed" ? current.type : rel.type);
  const confirmed = new Map<string, Decision>(snap.decided).set(relId, { status: "confirmed", type, ...PLACEHOLDER });
  const after = claimStates(snap.claims, snap.docsById, snap.relationships, confirmed);

  const claimById = new Map(snap.claims.map((c) => [c.id, c]));
  const groups = new Set([groupKey(claimById.get(rel.from_claim_id)!), groupKey(claimById.get(rel.to_claim_id)!)]);
  const brief = (id: string) => {
    const c = claimById.get(id)!;
    const d = snap.docsById.get(c.document_id)!;
    return { id, documentId: d.id, documentTitle: d.title, unit: d.unit, date: d.date, recordStatus: d.record_status, value: c.value, quote: c.quote, location: c.location };
  };
  // Claims in either value group that this relationship, once confirmed, marks superseded, corrected or contradicted.
  const affected = snap.claims.filter((c) => groups.has(groupKey(c)) && hit(after.get(c.id)!));
  const affectedIds = new Set(affected.map((c) => c.id));

  const documents = [...new Set(affected.map((c) => c.document_id))].map((id) => {
    const d = snap.docsById.get(id)!;
    return { id, title: d.title, unit: d.unit, claims: affected.filter((c) => c.document_id === id).map((c) => c.id) };
  });

  const replacing = brief(rel.from_claim_id);
  const label = taxonomy().subjects[claimById.get(rel.from_claim_id)!.subject]?.label ?? "This rule";
  const recall = allAnswers()
    .map((a) => ({ a, cited: (JSON.parse(a.cited_claim_ids) as string[]).filter((id) => affectedIds.has(id)) }))
    .filter(({ cited }) => cited.length)
    .map(({ a, cited }) => {
      const state = after.get(cited[0])!;
      const reason =
        type === "contradicts"
          ? `${label}: the cited record conflicts with current declared records (${state.contradictedBy.map((id) => claimById.get(id)!.document_id).join(", ")}).`
          : `${label} has changed. ${replacing.documentTitle} (${replacing.documentId}, ${replacing.date}) says: "${replacing.quote}"`;
      return { answerId: a.id, staffId: a.staff_id, askedAt: a.ts_utc, question: a.question, citedClaimIds: cited, replacingClaimId: type === "contradicts" ? state.contradictedBy[0] ?? null : rel.from_claim_id, reason };
    });

  return { relationship: rel, type, decision: current ?? { status: "proposed" }, from: brief(rel.from_claim_id), to: brief(rel.to_claim_id), affectedClaims: [...affectedIds], documents, recall };
}

/** Writes RECALL_ISSUED once per answer per relationship. */
export function issueRecalls(relId: string, actor: string) {
  const impact = impactOfRelationship(relId);
  if (!impact) return [];
  const done = new Set(
    allEntries()
      .filter((e) => e.action === "RECALL_ISSUED")
      .map((e) => `${e.target_id}|${JSON.parse(e.payload_json).relationship_id}`),
  );
  return impact.recall
    .filter((r) => !done.has(`${r.answerId}|${relId}`))
    .map((r) =>
      append({
        actor,
        action: "RECALL_ISSUED",
        targetType: "ai_answer",
        targetId: r.answerId,
        payload: { relationship_id: relId, staff_id: r.staffId, cited_claim_ids: r.citedClaimIds, replacing_claim_id: r.replacingClaimId },
        reason: r.reason,
      }),
    );
}

export function recallNotices() {
  return allEntries()
    .filter((e) => e.action === "RECALL_ISSUED")
    .map((e) => {
      const p = JSON.parse(e.payload_json);
      return { id: `N${e.seq}`, answerId: e.target_id, staffId: p.staff_id, relationshipId: p.relationship_id, replacingClaimId: p.replacing_claim_id, reason: e.reason, issuedBy: e.actor, createdAt: e.ts_utc };
    });
}

/** Answers that cited an older version: still holding where the new version restates the value. */
function versionImpact(docId: string) {
  const { docsById, claims } = snapshot();
  const doc = docsById.get(docId)!;
  if (!doc.series || doc.version === null || doc.record_status !== "declared") return { olderVersions: [], stillHolds: [] };
  const older = [...docsById.values()].filter((d) => d.series === doc.series && d.version !== null && d.version < doc.version!);
  const olderIds = new Set(older.map((d) => d.id));
  const restated = new Map(claims.filter((c) => c.document_id === docId).map((c) => [groupKey(c), c.id]));
  const claimById = new Map(claims.map((c) => [c.id, c]));
  const stillHolds = allAnswers().flatMap((a) =>
    (JSON.parse(a.cited_claim_ids) as string[])
      .map((id) => claimById.get(id)!)
      .filter((c) => c && olderIds.has(c.document_id) && restated.has(groupKey(c)))
      .map((c) => ({ answerId: a.id, staffId: a.staff_id, question: a.question, citedClaimId: c.id, restatedBy: restated.get(groupKey(c))!, note: "Source updated, answer still holds." })),
  );
  return { olderVersions: older.map((d) => d.id), stillHolds };
}

/** What a newly arrived document changes: its proposals with their impact, and version updates. */
export function arrivalImpact(docId: string) {
  const { claims, relationships } = snapshot();
  const mine = new Set(claims.filter((c) => c.document_id === docId).map((c) => c.id));
  const proposals = relationships
    .filter((r) => mine.has(r.from_claim_id) || mine.has(r.to_claim_id))
    .map((r) => impactOfRelationship(r.id)!);
  return { proposals, versions: versionImpact(docId) };
}
