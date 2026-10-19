import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  AiReviewSchema,
  AssistSchema,
  KNOWN_ATTRIBUTES,
  ExtractedDocSchema,
  type AssistInput,
  type Assistance,
  type CandidateFinding,
  type DocInput,
  type ExtractedDoc,
  type ScanProvider,
} from "@/lib/scanner/types";
import type { AiReview } from "@/lib/types";

/**
 * Gemini does two jobs here and nothing else:
 *   1. extract structured facts from each document (the "scan"),
 *   2. give a grounded second opinion on findings the engine has already built (the "review").
 * It never decides what is true on its own. Conflicts, supersession, hashes and citations are
 * worked out in engine.ts, so a wrong model answer cannot invent a finding.
 */

export const DEFAULT_MODEL = "gemini-flash-latest";
const MAX_CHARS = 90_000;

export function geminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || undefined;
}
export const geminiModel = () => process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ApiErrorLike {
  status?: number;
  message?: string;
}

/** Turns SDK errors into something an information manager can act on. */
export function friendlyGeminiError(e: unknown): string {
  const err = e as ApiErrorLike;
  const msg = String(err?.message ?? e);
  if (err?.status === 400 && /api key/i.test(msg)) return "Gemini rejected the API key. Check GEMINI_API_KEY in .env.local.";
  if (err?.status === 401 || err?.status === 403) return "Gemini refused the request. The API key may be invalid, restricted, or missing access.";
  if (err?.status === 404) return `Gemini could not find the model "${geminiModel()}". Set GEMINI_MODEL in .env.local to a model your key can use.`;
  if (err?.status === 429) return "Gemini rate limit reached. Wait a minute and scan again, or use a key with more quota.";
  if (/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(msg)) return "Could not reach the Gemini API. Check the network connection.";
  return msg.length > 300 ? msg.slice(0, 300) + "…" : msg;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const err = e as ApiErrorLike;
      const retryable = [429, 500, 502, 503, 504].includes(err?.status ?? 0) || /ECONNRESET|ETIMEDOUT|fetch failed/i.test(String(err?.message));
      if (!retryable || attempt >= 3) throw e;
      await sleep(1200 * 2 ** attempt + Math.random() * 400);
    }
  }
}

let client: GoogleGenAI | null = null;
const ai = () => (client ??= new GoogleGenAI({ apiKey: geminiKey() }));

/** Some schema features may be rejected by the API; remember that and fall back to prompt-only JSON. */
let schemaSupported = true;

function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

async function generateJson<T>(schema: z.ZodType<T>, system: string, parts: Part[]): Promise<T> {
  const run = async (useSchema: boolean): Promise<T> => {
    const jsonSchema = jsonSchemaOf(schema);
    const prompt: Part[] = useSchema
      ? parts
      : [...parts, { text: `\n\nReturn ONLY valid JSON matching this JSON Schema:\n${JSON.stringify(jsonSchema)}` }];
    const res = await withRetry(() =>
      ai().models.generateContent({
        model: geminiModel(),
        contents: [{ role: "user", parts: prompt }],
        config: {
          systemInstruction: system,
          temperature: 0,
          responseMimeType: "application/json",
          ...(useSchema ? { responseJsonSchema: jsonSchema } : {}),
        },
      }),
    );
    const raw = (res.text ?? "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    if (!raw) throw new Error("Gemini returned an empty response.");
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error(`Gemini returned JSON that did not match the expected shape: ${parsed.error.issues[0]?.message}`);
    return parsed.data;
  };

  try {
    return await run(schemaSupported);
  } catch (e) {
    const err = e as ApiErrorLike;
    // A 400 that is not about the key usually means the API rejected part of the schema. Retry once with prompt-only JSON.
    if (schemaSupported && err?.status === 400 && !/api key|API_KEY_INVALID/i.test(String(err.message))) {
      schemaSupported = false;
      return run(false);
    }
    // One re-ask for malformed or non-conforming JSON.
    if (e instanceof SyntaxError || /did not match the expected shape|empty response/.test(String((e as Error).message))) return run(schemaSupported);
    throw e;
  }
}

/* ---------- prompts ---------- */

const EXTRACT_SYSTEM = `You extract structured facts from documents for an information manager (the National Archives of Australia and agencies it works with). The documents can be records authorities, policies, guidelines, procedures, FAQs, scripts, briefings, minutes, emails or newsletters.

You only EXTRACT. You do not judge, compare, or decide what is true. Other software compares documents; your job is to read each one faithfully so that comparison is possible.

Rules:
- Quote exactly. Every claim's "quote" must be a sentence copied word for word from the document.
- Extract every concrete, checkable rule or figure the document states as fact: how long records are kept, eligibility limits, payment amounts, deadlines, fees, payment methods, tenure or residency conditions, proof requirements, who is covered. Skip opinion, greetings and filler.
- "attribute" is a snake_case name for the kind of fact. Prefer these names: ${KNOWN_ATTRIBUTES.filter((a) => a !== "other").join(", ")}. If none fits, invent a short snake_case name rather than using "other". Use the SAME name for the same kind of fact in every document.
- Normalise "value": durations as "<number> years" ("seven" becomes "7 years"), money as "$120,000", dates as "31 October 2026". For payment_amount list every amount stated, for example "$2,000, $5,000, $10,000", or the flat amount if everyone gets the same. For eligibility_conditions put every condition in one value, separated by "; ".
- Do NOT extract measurements that change over time or are only reported (counts of applications, average processing days, totals paid). Extract rules, not statistics.
- "subject" is a short lower-case noun phrase for what the statement is about. Use the same phrase for the same thing across a document.
- "appliesTo": set it only when the statement is an exception or covers a narrower group than everyone (for example "remote communities"). Otherwise null.
- "effectiveFrom": the date a change takes effect, if stated, else null.
- "basedOn": if a figure is calculated from or assumes another stated value, that value; otherwise null.
- "refersTo": titles of OTHER documents this one says it is based on or copied from. Empty if none.
- "authorityNumbers": every Records Authority number mentioned anywhere, in the form 2024/00561247.
- "status": current, draft, superseded, withdrawn or unknown, from what the document says about itself.
- "aiGenerated": true only if the document itself says an AI assistant wrote or summarised it.
- "languageFlags": quote wording that is outdated, gendered, or may be harmful or demeaning to the people the records concern (for example historical terms for Aboriginal and Torres Strait Islander peoples), and say why in one short sentence. Do not flag neutral legal or technical terms unless the wording itself is a concern.
- If something is not stated in the document, use null or an empty list. Never guess.
- "date" is the date of the document as YYYY-MM-DD, or null.
- "organisation" is the short name of the organisation that produced it (for example "NAA" or an agency acronym or name).
- A front-matter block at the top (between --- lines) states the record's own id, version and status. Treat it as metadata, not as a claim.`;

function extractPrompt(doc: DocInput): string {
  return `Extract the structured facts from this document.\nFile name: ${doc.name}\n`;
}

const REVIEW_SYSTEM = `You are a careful second reviewer for an archivist. You are given ONE finding that a deterministic engine raised, with the evidence it relied on. Decide whether the evidence supports the finding.

Rules:
- Use only the evidence provided. Do not use outside knowledge about the documents.
- "agree" if the evidence clearly supports the finding, "disagree" if it clearly does not (for example the two statements are about different things), "unsure" if the evidence is not enough.
- Answer in one or two plain sentences.`;

const ASSIST_SYSTEM = `You help a records or information manager decide what to do about one finding raised by a document scanner. You give a recommendation; the human decides.

Rules:
- Use only the evidence provided. If the evidence is not enough, recommend "needs_human" and say what to check.
- "confirm" means the finding is a real problem to fix. "dismiss" means it is not a problem.
- "suggestedAction" is one concrete next step. "draftNote" is a short sentence the manager could record with their decision.
- Plain, direct language. No hedging filler.`;

/* ---------- provider ---------- */

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();

export function geminiProvider(): ScanProvider {
  return {
    id: "gemini",
    label: "Gemini",
    model: geminiModel(),
    paceMs: 0,

    async extract(doc: DocInput) {
      const parts: Part[] = [{ text: extractPrompt(doc) }];
      let groundingText: string | null = null;
      if (doc.text !== null) {
        const text = doc.text.length > MAX_CHARS ? doc.text.slice(0, MAX_CHARS) : doc.text;
        groundingText = text;
        parts.push({ text: `--- DOCUMENT START ---\n${text}\n--- DOCUMENT END ---` });
      } else if (doc.ext === "pdf") {
        parts.push({ inlineData: { mimeType: "application/pdf", data: doc.bytes.toString("base64") } });
      } else {
        throw new Error(`Cannot read .${doc.ext} files yet.`);
      }

      const out: ExtractedDoc = await generateJson(ExtractedDocSchema, EXTRACT_SYSTEM, parts);
      const warnings: string[] = [];

      // Grounding check: drop any claim whose quote does not appear in the document.
      if (groundingText) {
        const haystack = norm(groundingText);
        const kept = out.claims.filter((c) => haystack.includes(norm(c.quote)));
        if (kept.length !== out.claims.length) warnings.push(`${out.claims.length - kept.length} claim(s) dropped because their quote was not found in the document`);
        out.claims = kept;
        const flags = out.languageFlags.filter((f) => haystack.includes(norm(f.quote)));
        if (flags.length !== out.languageFlags.length) warnings.push(`${out.languageFlags.length - flags.length} wording flag(s) dropped because their quote was not found`);
        out.languageFlags = flags;
      }

      out.date = out.date && /^\d{4}-\d{2}-\d{2}$/.test(out.date) ? out.date : null;
      out.authorityNumbers = [...new Set(out.authorityNumbers.filter((n) => /^20\d{2}\/\d{8}$/.test(n)))];
      return { ...out, warnings };
    },

    async review(candidate: CandidateFinding, docTitles: Record<string, string>): Promise<AiReview | null> {
      const evidence = candidate.evidence
        .map((e) => `- ${e.label}${e.docId ? ` (${docTitles[e.docId] ?? "document"})` : ""}: ${e.quote.replace(/\[\[|\]\]/g, "")}`)
        .join("\n");
      const prompt = `Finding: ${candidate.title}\nSummary: ${candidate.summary}\nKind: ${candidate.kind}\nEvidence:\n${evidence || "(none beyond the document list)"}`;
      try {
        return await generateJson(AiReviewSchema, REVIEW_SYSTEM, [{ text: prompt }]);
      } catch {
        return null;
      }
    },

    async assist(input: AssistInput): Promise<Assistance> {
      const evidence = input.evidence.map((e) => `- ${e.label}${e.doc ? ` (${e.doc})` : ""}: ${e.quote}`).join("\n");
      const prompt = `Finding: ${input.title}\nSummary: ${input.summary}\nKind: ${input.kind}\nScanner confidence: ${input.confidence}%\nDocuments involved: ${input.documents.join("; ")}\nEvidence:\n${evidence}`;
      return generateJson(AssistSchema, ASSIST_SYSTEM, [{ text: prompt }]);
    },
  };
}
