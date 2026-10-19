import { db, transaction } from "./db.ts";
import { canonicalJson, sha256 } from "./hash.ts";
import { append, entriesFor } from "./ledger.ts";
import { getDocument, type DocumentRow } from "./ingest.ts";
import { taxonomy, type Taxonomy } from "./config.ts";
import { structuredCall } from "./llm.ts";

/** EXTRACT_V1: claims from one document. Every quote must appear verbatim in the text. */

export const PROMPT_VERSION = "EXTRACT_V1";
const ACTOR = "Sherlock";

export interface RawClaim {
  subject: string;
  statement: string;
  value: string;
  scope: string;
  effective_from: string;
  effective_to: string;
  quote: string;
}

export interface ClaimRow extends Omit<RawClaim, "effective_from" | "effective_to"> {
  effective_from: string | null;
  effective_to: string | null;
  id: string;
  document_id: string;
  location: string;
  claim_hash: string;
  origin_claim_id: string | null;
  is_echo: number;
  model: string;
  prompt_version: string;
}

const SYSTEM = `You extract checkable claims from one record in a government records collection.

A claim is a single checkable statement of a figure, amount, date or rule that a staff member might rely on when answering the public. For each claim give:
- subject: one key from the subject list, or "other" if none fits.
- statement: the claim as one plain sentence.
- value: the normalised value, written exactly in the format the subject list gives, so the same fact in different documents produces the same string. For "other", a short snake_case summary.
- scope: who the claim applies to, for example "all applicants" or "applicants in remote communities".
- effective_from and effective_to: ISO dates if the record states them, otherwise "".
- quote: an exact, verbatim copy of the sentence or clause in the record that states the claim, character for character. Never paraphrase, fix typos or join text from different places.

Extract only what the record itself states, even if you believe it is wrong, out of date or fraudulent. Do not infer, combine or correct. One claim per fact; a sentence stating several facts may give several claims with the same quote. Skip background, contact details and process descriptions that are not checkable rules.`;

function renderUser(doc: DocumentRow, subjects: Taxonomy["subjects"]): string {
  const list = Object.entries(subjects)
    .map(([key, s]) => `- ${key}: ${s.label}. Value format: ${s.value}`)
    .join("\n");
  return `Record metadata
id: ${doc.id}
title: ${doc.title}
business unit: ${doc.unit}
business function: ${doc.function}
date: ${doc.date}

Subjects
${list}
- other: anything checkable that fits no subject above. Value format: short snake_case summary

<record>
${doc.text}
</record>`;
}

function schema(subjects: string[]): Record<string, unknown> {
  const text = { type: "string" };
  return {
    type: "object",
    properties: {
      claims: {
        type: "array",
        items: {
          type: "object",
          properties: {
            subject: { type: "string", enum: [...subjects, "other"] },
            statement: text,
            value: text,
            scope: text,
            effective_from: text,
            effective_to: text,
            quote: text,
          },
          required: ["subject", "statement", "value", "scope", "effective_from", "effective_to", "quote"],
          additionalProperties: false,
        },
      },
    },
    required: ["claims"],
    additionalProperties: false,
  };
}

export const normaliseWhitespace = (s: string) => s.replace(/\s+/g, " ").trim();

export type ClaimCheck = { ok: true; location: string } | { ok: false; reason: string };

/** Rejects rather than repairs: unknown subject, empty field, bad date, or a quote not in the text. */
export function validateClaim(c: RawClaim, text: string, subjects: Set<string>): ClaimCheck {
  for (const key of ["subject", "statement", "value", "scope", "quote"] as const) {
    if (typeof c[key] !== "string" || !c[key].trim()) return { ok: false, reason: `Empty ${key}.` };
  }
  if (!subjects.has(c.subject)) return { ok: false, reason: `Subject "${c.subject}" is not in the taxonomy.` };
  for (const d of [c.effective_from, c.effective_to]) {
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, reason: `"${d}" is not an ISO date.` };
  }
  const quote = normaliseWhitespace(c.quote);
  if (!normaliseWhitespace(text).includes(quote)) return { ok: false, reason: "Quote does not appear verbatim in the document." };
  const idx = text.split(/\n\s*\n/).findIndex((p) => normaliseWhitespace(p).includes(quote));
  return { ok: true, location: idx >= 0 ? `paragraph ${idx + 1}` : "spans paragraphs" };
}

export function claimsFor(documentId: string): ClaimRow[] {
  return db().prepare("SELECT * FROM claims WHERE document_id = ? ORDER BY id").all(documentId) as unknown as ClaimRow[];
}

export function allClaims(): ClaimRow[] {
  return db().prepare("SELECT * FROM claims ORDER BY id").all() as unknown as ClaimRow[];
}

export async function extractDocument(id: string): Promise<{ accepted: number; rejected: number; cached: boolean }> {
  const doc = getDocument(id);
  if (!doc) throw new Error(`No document ${id}.`);
  if (entriesFor(id, "EXTRACT").length) {
    return { accepted: claimsFor(id).length, rejected: entriesFor(id, "EXTRACT_REJECTED").length, cached: true };
  }

  const subjects = taxonomy().subjects;
  const result = await structuredCall<{ claims: RawClaim[] }>({
    promptVersion: PROMPT_VERSION,
    system: SYSTEM,
    user: renderUser(doc, subjects),
    schema: schema(Object.keys(subjects)),
  });
  const known = new Set([...Object.keys(subjects), "other"]);
  const provenance = { model: result.model, prompt_version: result.promptVersion, cached: result.cached };

  return transaction(() => {
    const accepted: { id: string; claim_hash: string }[] = [];
    let rejected = 0;
    for (const raw of result.output.claims) {
      const check = validateClaim(raw, doc.text, known);
      if (!check.ok) {
        rejected++;
        append({
          actor: ACTOR,
          action: "EXTRACT_REJECTED",
          targetType: "document",
          targetId: id,
          payload: { ...provenance, claim: raw },
          reason: check.reason,
        });
        continue;
      }
      const fields = {
        document_id: id,
        subject: raw.subject,
        statement: raw.statement,
        value: raw.value,
        scope: raw.scope,
        effective_from: raw.effective_from || null,
        effective_to: raw.effective_to || null,
        quote: raw.quote,
        location: check.location,
      };
      const row = {
        id: `${id}-C${String(accepted.length + 1).padStart(2, "0")}`,
        ...fields,
        claim_hash: sha256(canonicalJson(fields)),
        model: result.model,
        prompt_version: result.promptVersion,
      };
      const cols = Object.keys(row) as (keyof typeof row)[];
      db()
        .prepare(`INSERT INTO claims (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
        .run(...cols.map((c) => row[c]));
      accepted.push({ id: row.id, claim_hash: row.claim_hash });
    }
    append({
      actor: ACTOR,
      action: "EXTRACT",
      targetType: "document",
      targetId: id,
      payload: { ...provenance, claims: accepted, rejected },
    });
    return { accepted: accepted.length, rejected, cached: result.cached };
  });
}
