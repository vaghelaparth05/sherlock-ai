import { NUMBER_TOKEN, numberFromToken, stripHtml } from "@/lib/text";
import type { Assistance, DocInput, ExtractedClaim, ExtractedDoc, ScanProvider } from "@/lib/scanner/types";

/**
 * Offline scanner: no AI, no network. It reads the header block and a fixed set of
 * recordkeeping phrasings with regular expressions. It exists so the whole product
 * works without an API key, and as a baseline to compare the Gemini scanner against.
 * It is deliberately narrow: anything it does not recognise is simply not extracted.
 */

const AUTH_RE = /\b(20\d{2}\/\d{8})\b/g;
const LEXICON: { term: RegExp; concern: string }[] = [
  { term: /native welfare/i, concern: "Outdated term for administering the affairs of Aboriginal and Torres Strait Islander peoples" },
  { term: /\bwards\b/i, concern: "Historical legal term that frames people as wards of the state; review description for context" },
  { term: /assimilation (policy|programs?)/i, concern: "Describes a discredited policy without context or critical framing" },
  { term: /\bmanpower\b/i, concern: "Gendered language; prefer 'workforce'" },
  { term: /\bchairman\b/i, concern: "Gendered language; prefer 'chair'" },
];

function parseHeader(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.split(/\r?\n/).slice(0, 30);
  for (const line of lines) {
    const m = line.match(/^\s*#?\s*(Title|Produced by|Date|Status|Type)\s*:\s*(.+?)\s*$/i);
    if (m) out[m[1].toLowerCase()] = m[2];
  }
  if (!out.title) {
    // JSON manifests carry the same fields under _meta.
    try {
      const j = JSON.parse(text);
      const meta = j?._meta;
      if (meta) {
        out.title = meta.title;
        out["produced by"] = meta.producedBy;
        out.date = meta.date;
        out.status = meta.status;
        out.type = meta.type;
      }
    } catch {
      /* not JSON */
    }
  }
  return out;
}

function organisationOf(producedBy: string): string {
  if (/national archives/i.test(producedBy)) return "NAA";
  const cleaned = producedBy.replace(/\(.*?\)/g, "").trim();
  const first = cleaned.split(/\s+/)[0] ?? cleaned;
  return /^[A-Z]{2,}$/.test(first) ? first : cleaned;
}

function statusOf(s: string | undefined): ExtractedDoc["status"] {
  const v = (s ?? "").toLowerCase();
  if (v.includes("supersed")) return "superseded";
  if (v.includes("draft")) return "draft";
  if (v.includes("withdraw")) return "withdrawn";
  if (v.includes("current")) return "current";
  return "unknown";
}

function cleanHeading(h: string): string {
  return h
    .replace(/^#+\s*/, "")
    .replace(/^class\s+\d+(\.\d+)*\s+/i, "")
    .replace(/\?$/, "")
    .trim();
}

function normaliseSubject(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function sentencesWithHeadings(text: string): { sentence: string; heading: string }[] {
  const out: { sentence: string; heading: string }[] = [];
  let heading = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#?\s*(Title|Produced by|Date|Status|Type)\s*:/i.test(line)) continue;
    if (/^#{1,6}\s/.test(line)) {
      heading = cleanHeading(line);
      continue;
    }
    // Question lines in FAQs act as headings.
    if (line.endsWith("?") && line.length < 120) {
      heading = cleanHeading(line);
      continue;
    }
    for (const s of line.split(/(?<=[.!])\s+(?=[A-Z$])/)) {
      const t = s.trim();
      if (t.length > 8) out.push({ sentence: t, heading });
    }
  }
  return out;
}

function subjectFor(sentence: string, heading: string): string {
  const m = sentence.match(/^(.{3,70}?)\s+(?:are|is|will be|must be|should be)\b/i);
  if (m && m[1].split(/\s+/).length <= 7 && !/^(records|commonwealth|this|it)\b/i.test(m[1])) {
    return normaliseSubject(m[1]);
  }
  return normaliseSubject(heading || "records");
}

function extractClaims(text: string, authorityNumbers: string[]): ExtractedClaim[] {
  const claims: ExtractedClaim[] = [];
  const items = sentencesWithHeadings(text);
  const num = NUMBER_TOKEN;
  let lastAmount: string | null = null;

  for (const { sentence, heading } of items) {
    const s = sentence;

    const amount = s.match(/\$\s?[\d,]+(?:\.\d+)?/);
    if (amount) lastAmount = amount[0].replace(/\s/g, "");

    // Transfer to the National Archives
    const tr = s.match(new RegExp(`transfer(?:red)? to the National Archives when the records are (${num}) years? old`, "i"));
    if (tr) {
      const n = numberFromToken(tr[1]);
      if (n !== null) {
        claims.push({
          subject: subjectFor(s, heading),
          attribute: "transfer_age",
          value: `${n} years`,
          quote: s,
          effectiveFrom: null,
          basedOn: null,
        });
      }
    }

    // Public access period
    const acc = s.match(new RegExp(`(?:open (?:access|to the public)|available for public access|open to public access)[^.]*?after (${num}) years`, "i"));
    if (acc) {
      const n = numberFromToken(acc[1]);
      if (n !== null) {
        claims.push({
          subject: "public access to commonwealth records",
          attribute: "access_period",
          value: `${n} years`,
          quote: s,
          effectiveFrom: null,
          basedOn: null,
        });
      }
    }

    // Budget estimates built on an assumed retention period
    const dep = s.match(new RegExp(`assumes (.+?) (?:are|is) destroyed (${num}) years? after`, "i"));
    if (dep) {
      const n = numberFromToken(dep[2]);
      if (n !== null) {
        claims.push({
          subject: "storage cost estimate",
          attribute: "other",
          value: lastAmount ?? "an amount",
          quote: s,
          effectiveFrom: null,
          basedOn: { subject: normaliseSubject(dep[1]), attribute: "retention_period", value: `${n} years` },
        });
      }
      continue;
    }

    // Retention / destruction periods (ignore transfer sentences handled above)
    if (!tr) {
      const ret = s.match(new RegExp(`(?:destroy(?:ed)?|kept|retained?)\\b[^.]*?\\b(${num}) years?`, "i"));
      if (ret && !/transfer/i.test(s)) {
        const n = numberFromToken(ret[1]);
        if (n !== null) {
          claims.push({
            subject: subjectFor(s, heading),
            attribute: "retention_period",
            value: `${n} years`,
            quote: s,
            effectiveFrom: null,
            basedOn: null,
          });
        }
      }
    }
  }
  void authorityNumbers;
  return claims;
}

function extract(doc: DocInput): ExtractedDoc {
  const raw = doc.text ?? "";
  const text = doc.ext === "html" || doc.ext === "htm" ? stripHtml(raw) : raw;
  const header = parseHeader(text);
  const producedBy = header["produced by"] ?? "Unknown";
  const authorityNumbers = [...new Set([...text.matchAll(AUTH_RE)].map((m) => m[1]))];

  // "Based on: <title>." lines name the document this one was copied from.
  const refersTo = [...text.matchAll(/Based on:\s*([^.\n]+)/gi)].map((m) => m[1].trim());

  const isTabular = doc.ext === "csv" || doc.ext === "json";
  const claims = isTabular ? [] : extractClaims(text, authorityNumbers);

  const languageFlags: ExtractedDoc["languageFlags"] = [];
  if (!isTabular) {
    for (const { sentence } of sentencesWithHeadings(text)) {
      for (const { term, concern } of LEXICON) {
        if (term.test(sentence) && !languageFlags.some((f) => f.concern === concern)) {
          languageFlags.push({ quote: sentence, concern });
        }
      }
    }
  }

  return {
    title: header.title ?? doc.name,
    producedBy,
    organisation: organisationOf(producedBy),
    date: header.date && /^\d{4}-\d{2}-\d{2}$/.test(header.date) ? header.date : null,
    docType: header.type ?? "Document",
    status: statusOf(header.status),
    refersTo,
    authorityNumbers,
    claims,
    languageFlags,
  };
}

const RECOMMEND: Record<string, { rec: Assistance["recommendation"]; action: string }> = {
  supersedes: { rec: "confirm", action: "Update or annotate the documents that still state the old value, and point staff to the current authority." },
  "contradicts-authority": { rec: "confirm", action: "Correct the document so it matches the Records Authority, and record who approved the change." },
  "depends-on": { rec: "confirm", action: "Ask the document owner to recalculate using the current value." },
  "possible-conflict": { rec: "needs_human", action: "Check whether the two statements cover the same subject before deciding." },
  altered: { rec: "confirm", action: "Compare against the registered original, find out who changed the file, and restore it if the change was not approved." },
  citation: { rec: "confirm", action: "Check the Records Authority register and correct the reference." },
  unsourced: { rec: "needs_human", action: "Ask the author to cite the Records Authority the periods come from." },
  "single-source": { rec: "needs_human", action: "Look for an independent source before treating the figure as corroborated." },
  echo: { rec: "needs_human", action: "Link the repeating pages to the original source instead of restating it." },
  terminology: { rec: "needs_human", action: "Review the description for reparative description, ideally with the communities the records concern." },
  representation: { rec: "needs_human", action: "Consider seeking documents from other organisations or perspectives." },
};

export const rulesProvider: ScanProvider = {
  id: "rules",
  label: "Offline rules scanner",
  model: null,
  paceMs: 450,
  async extract(doc) {
    if (doc.text === null) {
      throw new Error(`The offline scanner cannot read .${doc.ext} files. Add a Gemini API key to scan these.`);
    }
    return extract(doc);
  },
  async review() {
    return null;
  },
  async assist(input) {
    const r = RECOMMEND[input.kind] ?? { rec: "needs_human" as const, action: "Review the evidence and decide." };
    return {
      recommendation: r.rec,
      rationale: "This is a rules-based suggestion from the offline scanner, not an AI judgement. Add a Gemini API key for a reasoned second opinion.",
      suggestedAction: r.action,
      draftNote: `${input.title}. ${r.action}`,
    };
  },
};
