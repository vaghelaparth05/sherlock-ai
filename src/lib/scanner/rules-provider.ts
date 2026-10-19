import { parseFrontMatter, stripFrontMatter } from "@/lib/frontmatter";
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
  if (v.includes("current") || v === "declared" || v === "final") return "current";
  return "unknown";
}

const humanise = (s: string) => {
  const t = s.replace(/_/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
};

/** "Department of Regional Recovery" if the text names one. Used when a record has no producer organisation. */
function departmentIn(text: string): string {
  const m = text.match(/Department of ([A-Z][a-z]+(?: [A-Z][a-z]+){0,3})/);
  return m ? `Department of ${m[1]}` : "";
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

const fmtMoney = (n: number) => `$${n.toLocaleString("en-US")}`;
const DATE_WORDS = "\\d{1,2}\\s+[A-Z][a-z]+\\s+\\d{4}";

/**
 * Facts about a grant or service: the income limit, amounts, deadline, fee, payment method,
 * eligibility conditions, and what evidence of address is accepted (including exceptions).
 */
function programClaims(items: { sentence: string; heading: string }[], body: string): ExtractedClaim[] {
  const out: ExtractedClaim[] = [];
  const push = (c: Pick<ExtractedClaim, "subject" | "attribute" | "value" | "quote"> & { appliesTo?: string }) =>
    out.push({ effectiveFrom: null, basedOn: null, appliesTo: c.appliesTo ?? null, subject: c.subject, attribute: c.attribute, value: c.value, quote: c.quote });

  const remote = /remote communit/i.test(body);
  let turnedAway = false;
  const cond: { owner?: string; residence?: string; area?: string } = {};

  for (const { sentence: s } of items) {
    const income =
      s.match(/income\s+(?:below|under|less than)\s+\$([\d,]+)/i) ??
      s.match(/earning\s+less\s+than\s+\$([\d,]+)/i) ??
      s.match(/income threshold from \$[\d,]+ to \$([\d,]+)/i);
    if (income) push({ subject: "household income", attribute: "income_threshold", value: `$${income[1]}`, quote: s });

    if (/owner-occupiers? only|only owner-occupiers?/i.test(s)) {
      push({ subject: "tenure", attribute: "tenure_requirement", value: "owner-occupiers only", quote: s });
      cond.owner ??= s;
    }
    if (/principal place of residence|main residence|main home/i.test(s)) cond.residence ??= s;
    if (/declared (?:\w+ )?disaster area|flood-affected area/i.test(s)) cond.area ??= s;

    const deadline = s.match(new RegExp(`\\bclos(?:e|es|ing)\\b[^.]*?(${DATE_WORDS})`)) ?? s.match(new RegExp(`until\\s+(${DATE_WORDS})\\s+to\\s+lodge`));
    if (deadline) push({ subject: "applications", attribute: "application_deadline", value: deadline[1], quote: s });

    if (/no fee is charged|never charged a fee|does not charge applicants any fee|applying is free|free to apply/i.test(s)) {
      push({ subject: "applications", attribute: "application_fee", value: "none", quote: s });
    }

    if (/electronic funds transfer/i.test(s) && /(own (?:bank )?account|own name)/i.test(s)) {
      push({ subject: "grant payments", attribute: "payment_method", value: "electronic funds transfer to applicant's own account", quote: s });
    }

    const amounts = [...s.matchAll(/\$([\d,]+)/g)].map((x) => Number(x[1].replace(/,/g, "")));
    if (amounts.length >= 2 && /tier|contents|structural/i.test(s)) {
      push({ subject: "grant payment per household", attribute: "payment_amount", value: [...new Set(amounts)].sort((a, b) => a - b).map(fmtMoney).join(", "), quote: s });
    } else {
      const flat = s.match(/(?:every|each|all)\s+eligible\s+households?\s+(?:will\s+)?(?:receives?|gets?)\s+\$([\d,]+)/i);
      if (flat) push({ subject: "grant payment per household", attribute: "payment_amount", value: `$${flat[1]}`, quote: s });
    }

    if (/remote communit/i.test(s) && /statutory declaration|letter from a community organi[sz]ation/i.test(s)) {
      push({ subject: "proof of address", attribute: "proof_of_address_requirement", value: "statutory declaration or community letter", quote: s, appliesTo: "remote communities" });
    } else if (/proof of address/i.test(s) && /utility bill/i.test(s) && /lease/i.test(s) && !/instead of/i.test(s)) {
      push({ subject: "proof of address", attribute: "proof_of_address_requirement", value: "utility bill or lease", quote: s });
    }
    if (!turnedAway && /(told they could not apply|turned away|could not apply)/i.test(s) && /(utility bill|lease)/i.test(s)) {
      turnedAway = true;
      push({
        subject: "proof of address",
        attribute: "proof_of_address_requirement",
        value: "turned away without a utility bill or lease",
        quote: s,
        appliesTo: remote ? "remote communities" : "applicants without a bill or lease",
      });
    }
  }

  // A document that lists several eligibility conditions presents itself as the eligibility summary.
  const found = [cond.owner && "owner-occupiers only", cond.residence && "principal place of residence", cond.area && "inside the declared disaster area"].filter(Boolean) as string[];
  if (found.length >= 2) {
    push({ subject: "grant eligibility", attribute: "eligibility_conditions", value: found.join("; "), quote: cond.owner ?? cond.residence ?? cond.area ?? "" });
  }
  return out;
}

function extract(doc: DocInput): ExtractedDoc {
  const raw = doc.text ?? "";
  const fm = parseFrontMatter(raw);
  const stripped = doc.ext === "html" || doc.ext === "htm" ? stripHtml(raw) : raw;
  const text = fm ? stripFrontMatter(stripped) : stripped;
  const header: Record<string, string> = fm ? {} : parseHeader(text);
  const producedBy = fm?.unit ?? header["produced by"] ?? "Unknown";
  const authorityNumbers = [...new Set([...text.matchAll(AUTH_RE)].map((m) => m[1]))];

  // "Based on: <title>." lines name the document this one was copied from.
  const refersTo = [...text.matchAll(/Based on:\s*([^.\n]+)/gi)].map((m) => m[1].trim());

  const isTabular = doc.ext === "csv" || doc.ext === "json";
  const claims = isTabular ? [] : extractClaims(text, authorityNumbers);
  if (!isTabular) claims.push(...programClaims(sentencesWithHeadings(text), text));
  const aiGenerated = fm?.recordStatus === "ai_generated" || /generated by (?:an )?AI assistant|this summary was generated by (?:an )?AI/i.test(text);

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

  const dateText = fm?.date ?? header.date;
  return {
    title: fm?.title ?? header.title ?? doc.name,
    producedBy,
    organisation: fm ? departmentIn(text) : organisationOf(producedBy),
    date: dateText && /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? dateText : null,
    docType: fm ? humanise(fm.series ?? fm.function ?? "document") : (header.type ?? "Document"),
    status: statusOf(fm?.recordStatus ?? header.status),
    aiGenerated,
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
  omission: { rec: "confirm", action: "Add the missing conditions to the summary, or replace it with the authoritative wording, before anyone relies on it." },
  "coverage-gap": { rec: "confirm", action: "Bring the record into the AI's sources, or tell users the AI cannot see it, so answers stop contradicting it." },
  "out-of-scope": { rec: "needs_human", action: "Decide whether the AI should be given this record, and say so wherever the AI answers questions." },
  "ai-unreviewed": { rec: "confirm", action: "Have a person check the AI-written content against the authoritative records and correct it before it is used." },
  "superseded-copy": { rec: "confirm", action: "Withdraw or update the old version so only the current one is live." },
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
