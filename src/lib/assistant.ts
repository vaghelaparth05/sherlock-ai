import { db } from "./db.ts";
import { structuredCall } from "./llm.ts";
import { registerRows, snapshot } from "./register.ts";
import { allAnswers, logAnswer } from "./impact.ts";
import { groupKey } from "./relate.ts";

/**
 * ANSWER_V1: answer a staff question from current claims in documents the assistant may read.
 * Every sentence must cite claims it was given; sentences that do not are removed. Each kept
 * sentence carries a trust label, and the answer is logged so recall can find it later.
 */

export const PROMPT_VERSION = "ANSWER_V1";

const SYSTEM = `You answer questions from call-centre staff about a government grant program, using only the claims provided.
Write a short answer of one to four sentences. Every sentence must cite the ids of the claims it relies on. Do not add facts, advice or numbers that the cited claims do not state.
If the claims do not answer the question, return one sentence saying the records available to you do not cover it, with an empty claim_ids list.`;

const SCHEMA = {
  type: "object",
  properties: {
    sentences: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, claim_ids: { type: "array", items: { type: "string" } } },
        required: ["text", "claim_ids"],
        additionalProperties: false,
      },
    },
  },
  required: ["sentences"],
  additionalProperties: false,
};

export interface ContextClaim {
  id: string;
  documentId: string;
  documentTitle: string;
  date: string;
  trust: number;
  statement: string;
  quote: string;
  independentSources: number;
}

/** Current, uncontested claims in documents that are in scope and allowed by the gate. */
export function answerContext(): ContextClaim[] {
  const snap = snapshot();
  const rows = new Map(registerRows().map((r) => [r.id, r]));
  return snap.claims
    .filter((c) => rows.get(c.document_id)?.aiReadable)
    .filter((c) => {
      const s = snap.states.get(c.id)!;
      return s.status === "current" && !s.contradicted;
    })
    .map((c) => {
      const d = snap.docsById.get(c.document_id)!;
      const group = snap.claims.filter((o) => groupKey(o) === groupKey(c) && !snap.states.get(o.id)!.echoOf && snap.docsById.get(o.document_id)!.record_status !== "ai_generated");
      return {
        id: c.id,
        documentId: d.id,
        documentTitle: d.title,
        date: d.date,
        trust: rows.get(d.id)!.trust ?? 0,
        statement: c.statement,
        quote: c.quote,
        independentSources: new Set(group.map((o) => snap.docsById.get(o.document_id)!.unit)).size,
      };
    });
}

export interface AnswerSentence {
  text: string;
  claimIds: string[];
  trust: number;
  label: string;
  sources: { documentId: string; documentTitle: string }[];
}

/** Keeps sentences that cite at least one given claim; labels them by their weakest source. */
export function checkAnswer(raw: { text: string; claim_ids: string[] }[], context: ContextClaim[]) {
  const byId = new Map(context.map((c) => [c.id, c]));
  const kept: AnswerSentence[] = [];
  const removed: { text: string; reason: string }[] = [];
  for (const s of raw) {
    const cited = [...new Set(s.claim_ids)].map((id) => byId.get(id)).filter((c) => c !== undefined);
    if (!s.text.trim()) continue;
    if (!cited.length) {
      removed.push({ text: s.text, reason: "removed: unsupported" });
      continue;
    }
    const trust = Math.min(...cited.map((c) => c.trust));
    const independent = Math.max(...cited.map((c) => c.independentSources));
    kept.push({
      text: s.text.trim(),
      claimIds: cited.map((c) => c.id),
      trust,
      label: `Trust ${trust} · consistent across ${independent} independent source${independent === 1 ? "" : "s"}`,
      sources: [...new Map(cited.map((c) => [c.documentId, { documentId: c.documentId, documentTitle: c.documentTitle }])).values()],
    });
  }
  return { kept, removed };
}

function nextAnswerId(): string {
  const n = allAnswers().reduce((max, a) => Math.max(max, Number(a.id.match(/^A(\d+)$/)?.[1] ?? 0)), 0);
  return `A${n + 1}`;
}

export async function ask(question: string, staffId: string) {
  const context = answerContext();
  const listing = context
    .map((c) => `[${c.id}] ${c.statement} (${c.documentTitle}, ${c.date}; quote: "${c.quote}")`)
    .join("\n");
  const result = await structuredCall<{ sentences: { text: string; claim_ids: string[] }[] }>({
    promptVersion: PROMPT_VERSION,
    system: SYSTEM,
    user: `Claims you may use:\n${listing}\n\nQuestion: ${question}`,
    schema: SCHEMA,
    maxTokens: 4000,
  });
  const checked = checkAnswer(result.output.sentences, context);
  const kept = checked.kept;
  // With nothing kept, the model said the records do not cover it; that is not a removed claim.
  const removed = kept.length ? checked.removed : [];
  const answer = {
    id: nextAnswerId(),
    ts_utc: new Date().toISOString(),
    staff_id: staffId,
    question,
    answer_json: JSON.stringify({ sentences: kept.map((s) => ({ text: s.text, claim_ids: s.claimIds, label: s.label })), removed, model: result.model, prompt_version: result.promptVersion }),
    cited_claim_ids: JSON.stringify([...new Set(kept.flatMap((s) => s.claimIds))]),
  };
  if (kept.length) logAnswer(answer);
  return {
    id: kept.length ? answer.id : null,
    question,
    sentences: kept,
    removed,
    answered: kept.length > 0,
    note: kept.length ? null : "No supported answer: the records the assistant may read do not cover this.",
    model: result.model,
    cached: result.cached,
  };
}

export function answerHistory(staffId?: string) {
  return (db().prepare("SELECT * FROM ai_answers ORDER BY ts_utc DESC").all() as { id: string; ts_utc: string; staff_id: string; question: string; answer_json: string }[])
    .filter((a) => !staffId || a.staff_id === staffId)
    .map((a) => ({ id: a.id, askedAt: a.ts_utc, staffId: a.staff_id, question: a.question, ...JSON.parse(a.answer_json) }));
}
