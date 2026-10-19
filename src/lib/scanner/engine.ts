import { createHash } from "node:crypto";
import { NUMBER_TOKEN, numberFromToken } from "@/lib/text";
import { GLOBAL_ATTRIBUTES, KNOWN_ATTRIBUTES, type CandidateFinding, type DocInput, type ExtractedClaim, type ExtractedDoc } from "@/lib/scanner/types";
import type { ClaimStatus, Evidence, Severity } from "@/lib/types";

/**
 * Deterministic analysis. The AI (or the rules scanner) only EXTRACTS structured facts
 * from each document. Everything that decides whether two facts conflict, which one is
 * current, who the original source is, whether a file was altered, or whether a record is
 * hidden from the AI happens here, in code, so results are reproducible and every finding
 * can point at its evidence.
 */

export interface EngineInput {
  doc: DocInput;
  ex: ExtractedDoc;
}

export interface EngineDoc {
  id: string;
  name: string;
  title: string;
  producedBy: string;
  organisation: string;
  date: string | null;
  year: number | null;
  docType: string;
  status: string;
  isAuthority: boolean;
  isRegister: boolean;
  recordStatus: string | null;
  series: string | null;
  version: number | null;
  inAiScope: boolean | null;
  aiGenerated: boolean;
  custody: string[];
  frontId: string | null;
}

export interface EngineClaim {
  key: string;
  text: string;
  attribute: string;
  subject: string;
  value: string;
  originDocId: string;
  citedByDocIds: string[];
  status: ClaimStatus;
}

export interface EngineResult {
  docs: EngineDoc[];
  claims: EngineClaim[];
  candidates: CandidateFinding[];
}

/* ---------- vocabulary ---------- */

const LABEL: Record<string, string> = {
  retention_period: "retention period",
  transfer_age: "transfer age",
  access_period: "open access period",
  disposal_action: "disposal action",
  security_classification: "security classification",
  custodian: "custodian",
  income_threshold: "household income limit",
  payment_amount: "grant payment",
  application_deadline: "closing date",
  application_fee: "application fee",
  payment_method: "payment method",
  tenure_requirement: "tenure rule",
  proof_of_address_requirement: "proof of address rule",
  eligibility_conditions: "eligibility conditions",
  other: "figure",
};
/** Global facts keep their original wording for the recordkeeping ones, so existing results do not change. */
const LEGACY_FORMAT = new Set(["access_period", "security_classification"]);

/** Maps the names an AI might invent for a common fact back to the canonical one. */
const CANON: [RegExp, string][] = [
  [/income.*(threshold|limit|cap|test|cut)|(threshold|limit|cap).*income|household income/, "income_threshold"],
  [/deadline|closing date|close date|applications? clos|last day to apply/, "application_deadline"],
  [/\bfee\b|charge|cost to apply|free to apply/, "application_fee"],
  [/payment method|paid (by|via)|method of payment|how .*paid|payment channel/, "payment_method"],
  [/payment (amount|tier)|grant (amount|tier)|amount.*(household|payment|grant)|payment per|tiers?\b/, "payment_amount"],
  [/owner|tenure|occupier|renter/, "tenure_requirement"],
  [/proof of address|address proof|evidence of address|address evidence|proof_of_address/, "proof_of_address_requirement"],
  [/eligibility (conditions|criteria|requirements)|eligib.*conditions|criteria/, "eligibility_conditions"],
];
const KNOWN = new Set<string>(KNOWN_ATTRIBUTES);
/** Measurements change over time (counts, averages), so two different readings are not a contradiction. */
const VOLATILE = /average|count|number[ _]of|total|rate\b|time[ _]to|processing[ _]time|received|approved|paid[ _]count|backlog|volume/;

function canonAttribute(raw: string): string {
  const a = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "other";
  if (KNOWN.has(a)) return a;
  const spaced = a.replace(/_/g, " ");
  for (const [re, name] of CANON) if (re.test(spaced)) return name;
  return a;
}

/* ---------- helpers ---------- */

const STOP = new Set(["the", "of", "and", "for", "a", "an", "to", "in", "on", "file", "record", "all", "any"]);
const singular = (t: string) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t);
const tokens = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).map(singular).filter((t) => !STOP.has(t));
const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a);
  const B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / (A.size + B.size - inter || 1);
};
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const fp = (...parts: string[]) => createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
const normText = (s: string) => s.toLowerCase().replace(/[^a-z0-9$.,/]+/g, " ").trim();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const MONTHS: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

function parseDate(v: string): string | null {
  const iso = v.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  const m = v.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/);
  const mo = m ? MONTHS[m[2].toLowerCase()] : undefined;
  return m && mo ? `${m[3]}-${String(mo).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}` : null;
}

const moneySet = (v: string) => [...new Set([...v.matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)].map((x) => Number(x[1].replace(/,/g, ""))))].sort((a, b) => a - b);

function durationYears(v: string): number | null {
  const m = v.match(new RegExp(`(${NUMBER_TOKEN})\\s+(year|month|day)s?`, "i"));
  if (!m) return null;
  const n = numberFromToken(m[1]);
  if (n === null) return null;
  const unit = m[2].toLowerCase();
  return unit === "year" ? n : unit === "month" ? n / 12 : n / 365;
}

const NONE = /^(none|nil|free|no fee|no charge|no cost|not charged|no fees?)$/i;

/** Canonical key so "10 years" and "ten years", "$90,000" and "90000 dollars", or two dates compare equal. */
function valueKey(v: string): string {
  const money = moneySet(v);
  if (money.length) return `amt:${money.join(",")}`;
  if (NONE.test(v.trim())) return "txt:none";
  const date = parseDate(v);
  if (date && !/year|month|day\b/i.test(v.replace(/\d{1,2}\s+[A-Za-z]+\s+\d{4}/, ""))) return `date:${date}`;
  const y = durationYears(v);
  if (y !== null) return `dur:${Math.round(y * 100) / 100}`;
  const t = tokens(v).sort();
  return t.length ? `txt:${t.join(" ")}` : `txt:${normText(v)}`;
}

function highlight(quote: string, value: string): string {
  const y = value.match(/^(\d+(?:\.\d+)?) years?$/i);
  if (y) {
    const re = new RegExp(`\\b(${NUMBER_TOKEN})\\s+years?\\b`, "gi");
    const target = Number(y[1]);
    let done = false;
    return quote.replace(re, (m, tok) => {
      if (!done && numberFromToken(tok) === target) {
        done = true;
        return `[[${m}]]`;
      }
      return m;
    });
  }
  const money = value.match(/\$\s?[\d,]+(?:\.\d+)?/g);
  if (money && money.length > 1) return money.reduce((q, m) => q.replace(m, `[[${m}]]`), quote);
  const i = quote.toLowerCase().indexOf(value.toLowerCase());
  return i === -1 ? quote : `${quote.slice(0, i)}[[${quote.slice(i, i + value.length)}]]${quote.slice(i + value.length)}`;
}

const monthYear = (iso: string | null) => {
  if (!iso) return "an undated";
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
};
const longDate = (iso: string | null) => {
  if (!iso) return "an undated";
  return new Date(iso + "T00:00:00Z").toLocaleString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

/* ---------- main ---------- */

interface Ctx extends EngineDoc {
  input: EngineInput;
  refersToIds: string[];
}

interface Instance {
  doc: Ctx;
  claim: ExtractedClaim;
  attribute: string;
  vkey: string;
}

interface Group {
  key: string;
  attribute: string;
  subject: string;
  subjectTokens: string[];
  instances: Instance[];
}

export function analyse(inputs: EngineInput[]): EngineResult {
  /* --- document context --- */
  const ctxs: Ctx[] = inputs.map(({ doc, ex }) => ({
    id: doc.id,
    name: doc.name,
    title: ex.title || doc.name,
    producedBy: ex.producedBy,
    organisation: ex.organisation || "",
    date: ex.date,
    year: ex.date ? Number(ex.date.slice(0, 4)) : null,
    docType: ex.docType,
    status: ex.status,
    isAuthority: (/authority/i.test(ex.docType) && !/register/i.test(ex.docType)) || ex.recordStatus === "declared",
    isRegister: /register|registry/i.test(ex.docType),
    recordStatus: ex.recordStatus ?? null,
    series: ex.series ?? null,
    version: ex.version ?? null,
    inAiScope: ex.inAiScope ?? null,
    aiGenerated: ex.aiGenerated === true || ex.recordStatus === "ai_generated",
    custody: ex.custody ?? [],
    frontId: ex.frontId ?? null,
    input: { doc, ex },
    refersToIds: [],
  }));

  // Records with no stated organisation belong to the one most of the collection names.
  const orgCounts = new Map<string, number>();
  for (const c of ctxs) if (c.organisation) orgCounts.set(c.organisation, (orgCounts.get(c.organisation) ?? 0) + 1);
  const majorityOrg = [...orgCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const c of ctxs) if (!c.organisation) c.organisation = majorityOrg ?? c.producedBy;

  // Who a record says it is based on: by title, or by the id in its front matter.
  for (const c of ctxs) {
    for (const ref of c.input.ex.refersTo) {
      const r = normText(ref);
      const hit = ctxs.find((o) => o.id !== c.id && (normText(o.title).includes(r) || r.includes(normText(o.title))));
      if (hit) c.refersToIds.push(hit.id);
    }
    for (const id of c.input.ex.cites ?? []) {
      const hit = ctxs.find((o) => o.id !== c.id && o.frontId === id);
      if (hit && !c.refersToIds.includes(hit.id)) c.refersToIds.push(hit.id);
    }
  }
  const dateOf = (c: Ctx) => c.date ?? "9999-12-31";

  /* the newest version in each series is the live one */
  const seriesLatest = new Map<string, Ctx>();
  for (const c of ctxs) {
    if (!c.series || c.version === null) continue;
    const cur = seriesLatest.get(c.series);
    if (!cur || (c.version ?? 0) > (cur.version ?? 0)) seriesLatest.set(c.series, c);
  }
  const isLatestVersion = (c: Ctx) => !!c.series && seriesLatest.get(c.series)?.id === c.id;

  /* --- claims, split into ordinary facts, scoped exceptions and condition lists --- */
  const instances: Instance[] = [];
  const scoped: Instance[] = [];
  const conditions: Instance[] = [];
  for (const c of ctxs) {
    for (const cl of c.input.ex.claims) {
      const attribute = canonAttribute(cl.attribute);
      if (VOLATILE.test(attribute) || attribute === "other") continue;
      const inst: Instance = { doc: c, claim: cl, attribute, vkey: valueKey(cl.value) };
      if (attribute === "eligibility_conditions") conditions.push(inst);
      else if (cl.appliesTo) scoped.push(inst);
      else instances.push(inst);
    }
  }

  const groups: Group[] = [];
  for (const inst of instances) {
    const global = GLOBAL_ATTRIBUTES.includes(inst.attribute);
    const toks = global ? ["_all"] : tokens(inst.claim.subject);
    let g = groups.find((x) => x.attribute === inst.attribute && jaccard(x.subjectTokens, toks) >= 0.5);
    if (!g) {
      g = {
        key: `${inst.attribute}|${global ? "all" : toks.join(" ")}`,
        attribute: inst.attribute,
        subject: global ? (LABEL[inst.attribute] ?? inst.attribute.replace(/_/g, " ")) : inst.claim.subject.toLowerCase(),
        subjectTokens: toks,
        instances: [],
      };
      if (inst.attribute === "access_period") g.subject = "public access to Commonwealth records";
      groups.push(g);
    }
    g.instances.push(inst);
  }
  // Wording varies ("owner-occupiers only" / "only owner-occupiers"): treat close text values as the same value.
  for (const g of groups) {
    const seen: string[] = [];
    for (const inst of g.instances) {
      if (!inst.vkey.startsWith("txt:")) continue;
      const toks = inst.vkey.slice(4).split(" ").filter(Boolean);
      const hit = seen.find((k) => jaccard(k.slice(4).split(" "), toks) >= 0.6);
      if (hit) inst.vkey = hit;
      else seen.push(inst.vkey);
    }
  }

  const claims: EngineClaim[] = [];
  const candidates: CandidateFinding[] = [];
  const claimKeyFor = (g: Group, vkey: string) => `${g.key}|${vkey}`;
  const outdatedValues = new Map<string, { value: string; authValue: string; authDoc: Ctx }>();

  /** How many independent sources stand behind a set of instances. */
  function independentRoots(list: Instance[]): Ctx[] {
    const ids = new Set(list.map((i) => i.doc.id));
    const derivative = (d: Ctx) => d.refersToIds.some((r) => ids.has(r));
    const roots = list.filter((i) => !derivative(i.doc)).map((i) => i.doc);
    const seenOrg = new Set<string>();
    const out: Ctx[] = [];
    for (const r of roots.sort((a, b) => dateOf(a).localeCompare(dateOf(b)))) {
      if (!seenOrg.has(r.organisation)) {
        seenOrg.add(r.organisation);
        out.push(r);
      }
    }
    return out;
  }
  const origin = (list: Instance[]): Ctx => [...list].sort((a, b) => dateOf(a.doc).localeCompare(dateOf(b.doc)))[0].doc;

  /** Which declared record wins when several state a fact: a Records Authority, then the newest version, then the latest. */
  const authorityOrder = (a: Instance, b: Instance) =>
    Number(/authority/i.test(b.doc.docType)) - Number(/authority/i.test(a.doc.docType)) ||
    Number(isLatestVersion(b.doc)) - Number(isLatestVersion(a.doc)) ||
    dateOf(b.doc).localeCompare(dateOf(a.doc));
  const isRecordsAuthority = (d: Ctx) => /authority/i.test(d.docType) && !/register/i.test(d.docType);
  const authName = (d: Ctx) => (isRecordsAuthority(d) ? "the Records Authority" : `“${d.title}”`);

  for (const g of groups) {
    const byValue = new Map<string, Instance[]>();
    for (const i of g.instances) byValue.set(i.vkey, [...(byValue.get(i.vkey) ?? []), i]);
    const label = LABEL[g.attribute] ?? g.attribute.replace(/_/g, " ");
    const global = GLOBAL_ATTRIBUTES.includes(g.attribute) && !LEGACY_FORMAT.has(g.attribute);
    const subjLabel = cap(g.subject);
    /** "Household income limit" for single-rule facts, "Grant application files: retention period" for the rest. */
    const topic = global ? cap(label) : subjLabel;
    const mkClaim = (vkey: string, status: ClaimStatus): EngineClaim => {
      const list = byValue.get(vkey)!;
      return {
        key: claimKeyFor(g, vkey),
        text: global ? `${cap(label)} is ${list[0].claim.value}` : `${subjLabel}: ${label} is ${list[0].claim.value}`,
        attribute: g.attribute,
        subject: g.subject,
        value: list[0].claim.value,
        originDocId: origin(list).id,
        citedByDocIds: [...new Set(list.map((i) => i.doc.id))],
        status,
      };
    };

    /* one value everywhere */
    if (byValue.size === 1) {
      const [vkey, list] = [...byValue.entries()][0];
      const roots = independentRoots(list);
      const hasAuthority = list.some((i) => i.doc.isAuthority);
      claims.push(mkClaim(vkey, hasAuthority ? "current" : roots.length >= 2 ? "corroborated" : "single"));

      const docsCount = new Set(list.map((i) => i.doc.id)).size;
      if (docsCount >= 3 && roots.length === 1 && !hasAuthority) {
        const o = origin(list);
        candidates.push({
          type: "bias",
          kind: "single-source",
          title: `${topic}: ${list[0].claim.value} rests on one original source`,
          summary: `${docsCount} documents state it, but they all trace back to ${o.title}. It counts as one source, not ${docsCount}.`,
          severity: "medium",
          confidence: 88,
          evidence: [{ label: "Origin", docId: o.id, quote: highlight(list.find((i) => i.doc.id === o.id)!.claim.quote, list[0].claim.value) }],
          docIds: [...new Set(list.map((i) => i.doc.id))],
          claimKeys: [claimKeyFor(g, vkey)],
          fingerprint: fp("bias", "single-source", g.key, vkey),
        });
      }
      continue;
    }

    /* several values: decide which is current */
    const authInst = g.instances.filter((i) => i.doc.isAuthority && i.doc.status !== "superseded" && i.doc.status !== "withdrawn").sort(authorityOrder);
    const auth = authInst[0] ?? null;

    if (auth) {
      const authKey = auth.vkey;
      claims.push(mkClaim(authKey, "current"));
      for (const [vkey, list] of byValue) {
        if (vkey === authKey) continue;
        const live = list.filter((i) => i.doc.status !== "superseded" && i.doc.status !== "withdrawn");
        const laterThanAuthority = live.filter((i) => dateOf(i.doc) >= dateOf(auth.doc) && i.doc.date);
        const outdated = live.filter((i) => !laterThanAuthority.includes(i));
        const o = origin(list);
        const oInst = list.find((i) => i.doc.id === o.id)!;
        const authEv: Evidence = { label: "Authority", docId: auth.doc.id, quote: highlight(auth.claim.quote, auth.claim.value) };
        const authLabel = isRecordsAuthority(auth.doc) ? "Authority" : "Current";

        /* a later document disagrees with the authority */
        for (const i of laterThanAuthority) {
          claims.push({ ...mkClaim(vkey, "review"), text: `${mkClaim(vkey, "review").text} (in ${i.doc.title})`, key: `${claimKeyFor(g, vkey)}|${i.doc.id}`, citedByDocIds: [i.doc.id], originDocId: i.doc.id });
          candidates.push({
            type: "misinformation",
            kind: "contradicts-authority",
            title: `${i.doc.title} disagrees with ${authName(auth.doc)} on ${g.attribute === "access_period" ? "public access" : global ? label : g.subject}`,
            summary: `It says ${i.claim.value}; ${isRecordsAuthority(auth.doc) ? "the authority" : "the current record"} says ${auth.claim.value}. The document is dated after ${isRecordsAuthority(auth.doc) ? "the authority" : "the current record"}, so it may have been changed or misread${i.doc.aiGenerated ? ", and it was written by an AI" : ""}.`,
            severity: "high",
            confidence: 90,
            evidence: [{ label: "This document", docId: i.doc.id, quote: highlight(i.claim.quote, i.claim.value) }, { ...authEv, label: authLabel }],
            docIds: [i.doc.id, auth.doc.id],
            claimKeys: [`${claimKeyFor(g, vkey)}|${i.doc.id}`, claimKeyFor(g, authKey)],
            fingerprint: fp("misinformation", "contradicts-authority", g.key, i.doc.id, vkey),
          });
        }

        /* the outdated figure rests on one original source, however many documents repeat it */
        const listDocs = new Set(list.map((i) => i.doc.id));
        if (listDocs.size >= 3 && independentRoots(list).length === 1) {
          candidates.push({
            type: "bias",
            kind: "single-source",
            title: `${topic}: ${list[0].claim.value} rests on one original source`,
            summary: `${listDocs.size} documents state it, but they all trace back to ${o.title}. It counts as one source, not ${listDocs.size}.`,
            severity: "medium",
            confidence: 88,
            evidence: [{ label: "Origin", docId: o.id, quote: highlight(oInst.claim.quote, list[0].claim.value) }],
            docIds: [...listDocs],
            claimKeys: [claimKeyFor(g, vkey)],
            fingerprint: fp("bias", "single-source", g.key, vkey),
          });
        }

        /* older documents still state a superseded value */
        if (outdated.length || list.some((i) => i.doc.status === "superseded")) {
          const claim = mkClaim(vkey, "superseded");
          claim.citedByDocIds = [...new Set(list.filter((i) => !laterThanAuthority.includes(i)).map((i) => i.doc.id))];
          if (claim.citedByDocIds.length) {
            claims.push(claim);
            outdatedValues.set(claim.key, { value: list[0].claim.value, authValue: auth.claim.value, authDoc: auth.doc });
            const affected = outdated.map((i) => i.doc.id);
            const sev: Severity = affected.length >= 2 || g.attribute === "retention_period" ? "high" : "medium";
            if (affected.length) {
              candidates.push({
                type: "misinformation",
                kind: "supersedes",
                title: `${g.attribute === "access_period" ? "Public access after" : topic + ":"} ${list[0].claim.value} is out of date`,
                summary: `${isRecordsAuthority(auth.doc) ? `The ${auth.doc.docType} dated ${monthYear(auth.doc.date)}` : `${auth.doc.title} (${longDate(auth.doc.date)})`} sets ${auth.claim.value}. ${affected.length} current ${affected.length === 1 ? "document still states" : "documents still state"} ${list[0].claim.value}.`,
                severity: sev,
                confidence: Math.min(97, 88 + Math.min(affected.length, 3) + (auth.doc.isAuthority ? 3 : 0)),
                evidence: [{ label: "Older", docId: o.id, quote: highlight(oInst.claim.quote, list[0].claim.value) }, { ...authEv, label: "Newer" }],
                docIds: [...new Set([o.id, ...affected])],
                claimKeys: [claim.key, claimKeyFor(g, authKey)],
                fingerprint: fp("misinformation", "supersedes", g.key, vkey),
              });
            }
          }
        }
      }
      continue;
    }

    /* no authority: compare by date */
    const ordered = [...byValue.entries()].sort((a, b) => dateOf(origin(b[1])).localeCompare(dateOf(origin(a[1]))));
    const [newestKey, newestList] = ordered[0];
    const newestDoc = origin(newestList);
    const clearlyNewest = ordered.slice(1).every(([, l]) => origin(l).date && newestDoc.date && dateOf(origin(l)) < dateOf(newestDoc)) && newestDoc.status === "current";
    if (clearlyNewest) {
      claims.push(mkClaim(newestKey, "current"));
      for (const [vkey, list] of ordered.slice(1)) {
        const c = mkClaim(vkey, "superseded");
        claims.push(c);
        outdatedValues.set(c.key, { value: list[0].claim.value, authValue: newestList[0].claim.value, authDoc: newestDoc });
        candidates.push({
          type: "misinformation",
          kind: "supersedes",
          title: `${topic}: ${list[0].claim.value} has been replaced`,
          summary: `${newestDoc.title} (${monthYear(newestDoc.date)}) states ${newestList[0].claim.value}. Older documents still state ${list[0].claim.value}.`,
          severity: "medium",
          confidence: 78,
          evidence: [
            { label: "Older", docId: origin(list).id, quote: highlight(list[0].claim.quote, list[0].claim.value) },
            { label: "Newer", docId: newestDoc.id, quote: highlight(newestList[0].claim.quote, newestList[0].claim.value) },
          ],
          docIds: [...new Set([...list.map((i) => i.doc.id), newestDoc.id])],
          claimKeys: [c.key, claimKeyFor(g, newestKey)],
          fingerprint: fp("misinformation", "supersedes", g.key, vkey),
        });
      }
    } else {
      const evs: Evidence[] = [];
      for (const [vkey, list] of byValue) {
        claims.push(mkClaim(vkey, "review"));
        evs.push({ label: cap(list[0].doc.docType), docId: list[0].doc.id, quote: highlight(list[0].claim.quote, list[0].claim.value) });
      }
      candidates.push({
        type: "misinformation",
        kind: "possible-conflict",
        title: `${topic}: ${[...byValue.values()].map((l) => l[0].claim.value).join(" versus ")}`,
        summary: "Documents give different values and none is clearly the current one. Sherlock cannot tell whether they describe the same thing, so it needs a person.",
        severity: "low",
        confidence: 57,
        evidence: evs.slice(0, 3),
        docIds: [...new Set(g.instances.map((i) => i.doc.id))],
        claimKeys: [...byValue.keys()].map((k) => claimKeyFor(g, k)),
        fingerprint: fp("misinformation", "possible-conflict", g.key, [...byValue.keys()].sort().join(",")),
      });
    }
  }

  /* --- figures built on another value (depends-on) --- */
  for (const c of ctxs) {
    for (const cl of c.input.ex.claims) {
      const b = cl.basedOn;
      if (!b) continue;
      const attr = canonAttribute(b.attribute);
      const btoks = tokens(b.subject);
      const g = groups.find((x) => x.attribute === attr && (GLOBAL_ATTRIBUTES.includes(attr) || jaccard(x.subjectTokens, btoks) >= 0.5));
      const bkey = valueKey(b.value);
      const baseKey = g ? claimKeyFor(g, bkey) : null;
      const outdated = baseKey ? outdatedValues.get(baseKey) : undefined;
      const claimKey = `dep|${c.id}|${normText(cl.subject)}`;
      claims.push({
        key: claimKey,
        text: `${cap(cl.subject)}: ${cl.value}`,
        attribute: "other",
        subject: cl.subject.toLowerCase(),
        value: cl.value,
        originDocId: c.id,
        citedByDocIds: [c.id],
        status: outdated ? "review" : "single",
      });
      if (outdated && baseKey) {
        candidates.push({
          type: "misinformation",
          kind: "depends-on",
          title: `${cap(cl.subject)} is built on an outdated figure`,
          summary: `The ${cl.value} figure assumes ${b.value}, but the current source says ${outdated.authValue}. It needs recalculating.`,
          severity: "medium",
          confidence: 88,
          evidence: [
            { label: "Depends on", docId: c.id, quote: highlight(highlight(cl.quote, b.value), cl.value) },
            {
              label: "Current",
              docId: outdated.authDoc.id,
              quote: highlight(instances.find((i) => i.doc.id === outdated.authDoc.id && valueKey(i.claim.value) === valueKey(outdated.authValue))?.claim.quote ?? "", outdated.authValue),
            },
          ],
          docIds: [c.id, outdated.authDoc.id],
          claimKeys: [claimKey, baseKey],
          fingerprint: fp("misinformation", "depends-on", c.id, claimKey),
        });
      }
    }
  }

  /* --- documents that state periods without citing an authority --- */
  for (const c of ctxs) {
    if (c.isAuthority || c.isRegister || c.status === "superseded" || c.input.ex.authorityNumbers.length) continue;
    const periodClaims = c.input.ex.claims.filter((cl) => ["retention_period", "transfer_age", "access_period"].includes(canonAttribute(cl.attribute)));
    if (!periodClaims.length) continue;
    candidates.push({
      type: "misinformation",
      kind: "unsourced",
      title: `${c.title} gives disposal periods without citing an authority`,
      summary: "The periods may be copied from an older schedule. Ask the author to cite the Records Authority they come from.",
      severity: "low",
      confidence: 70,
      evidence: periodClaims.slice(0, 2).map((cl) => ({ label: "States", docId: c.id, quote: highlight(cl.quote, cl.value) })),
      docIds: [c.id],
      claimKeys: [],
      fingerprint: fp("misinformation", "unsourced", c.name),
    });
  }

  /* --- older versions that are still in circulation --- */
  const bySeries = new Map<string, Ctx[]>();
  for (const c of ctxs) if (c.series && c.version !== null) bySeries.set(c.series, [...(bySeries.get(c.series) ?? []), c]);
  for (const [series, list] of bySeries) {
    if (list.length < 2) continue;
    const latest = seriesLatest.get(series)!;
    for (const old of list) {
      if (old.id === latest.id || old.status === "superseded" || old.status === "withdrawn" || old.recordStatus === "superseded") continue;
      const live = old.inAiScope !== false;
      candidates.push({
        type: "misinformation",
        kind: "superseded-copy",
        title: `${old.title} is replaced by version ${latest.version} but is still in use`,
        summary: `Version ${old.version} (${longDate(old.date)}) was replaced on ${longDate(latest.date)}, yet it is still marked ${old.recordStatus ?? old.status}${old.custody.length ? ` and kept in ${old.custody.join(", ").replace(/_/g, " ")}` : ""}. People and AI tools can still find and use it.`,
        severity: old.recordStatus === "declared" ? "low" : "medium",
        confidence: 92,
        evidence: [
          { label: `Version ${old.version}`, docId: old.id, quote: `${old.title}, ${longDate(old.date)}, status: ${old.recordStatus ?? old.status}` },
          { label: `Version ${latest.version}`, docId: latest.id, quote: `${latest.title}, ${longDate(latest.date)}, status: ${latest.recordStatus ?? latest.status}` },
        ],
        docIds: [old.id, latest.id],
        claimKeys: [],
        fingerprint: fp("misinformation", "superseded-copy", series, String(old.version)),
      });
      void live;
    }
  }

  /* --- AI summaries that leave out a condition the authoritative record states --- */
  const authConditions = conditions.filter((i) => i.doc.isAuthority && i.doc.status !== "superseded").sort(authorityOrder)[0];
  if (authConditions) {
    const items = (v: string) => v.split(/[;]+/).map((x) => x.trim()).filter(Boolean);
    const authItems = items(authConditions.claim.value);
    for (const inst of conditions) {
      if (!inst.doc.aiGenerated) continue;
      const have = items(inst.claim.value);
      const missing = authItems.filter((a) => !have.some((h) => jaccard(tokens(a), tokens(h)) >= 0.5));
      if (!missing.length) continue;
      candidates.push({
        type: "misinformation",
        kind: "omission",
        title: `${inst.doc.title} leaves out ${missing.length === 1 ? "an eligibility condition" : "eligibility conditions"}`,
        summary: `It lists who can apply but omits: ${missing.join("; ")}. Someone who does not meet ${missing.length === 1 ? "it" : "them"} could be told to apply.`,
        severity: "medium",
        confidence: 82,
        evidence: [
          { label: "This summary", docId: inst.doc.id, quote: inst.claim.quote || have.join("; ") },
          { label: "Authoritative record", docId: authConditions.doc.id, quote: authConditions.claim.quote || authItems.join("; ") },
        ],
        docIds: [inst.doc.id, authConditions.doc.id],
        claimKeys: [],
        fingerprint: fp("misinformation", "omission", inst.doc.name, missing.join(",")),
      });
    }
  }

  /* --- declared exceptions the AI cannot see --- */
  const covered = new Set<string>();
  const generalByAttr = new Map<string, Instance[]>();
  for (const i of instances) generalByAttr.set(i.attribute, [...(generalByAttr.get(i.attribute) ?? []), i]);
  const scopedByAttr = new Map<string, Instance[]>();
  for (const i of scoped) scopedByAttr.set(i.attribute, [...(scopedByAttr.get(i.attribute) ?? []), i]);
  for (const [attr, exceptions] of scopedByAttr) {
    const hidden = exceptions.filter((i) => i.doc.inAiScope === false);
    const general = (generalByAttr.get(attr) ?? []).filter((i) => i.doc.inAiScope !== false).sort((a, b) => dateOf(b.doc).localeCompare(dateOf(a.doc)));
    const claimKey = `scoped|${attr}`;
    const who = exceptions[0].claim.appliesTo ?? "some applicants";
    claims.push({
      key: claimKey,
      text: `${cap(LABEL[attr] ?? attr.replace(/_/g, " "))} for ${who}: ${exceptions.find((e) => e.doc.isAuthority)?.claim.value ?? exceptions[0].claim.value}`,
      attribute: attr,
      subject: who,
      value: exceptions[0].claim.value,
      originDocId: origin(exceptions).id,
      citedByDocIds: [...new Set(exceptions.map((i) => i.doc.id))],
      status: hidden.length && general.length ? "review" : "single",
    });
    if (!hidden.length || !general.length) continue;

    const docs = [...new Map(exceptions.map((i) => [i.doc.id, i])).values()];
    const rule = general[0];
    docs.forEach((i) => covered.add(i.doc.id));
    candidates.push({
      type: "bias",
      kind: "coverage-gap",
      title: `The exception for ${who} is hidden from the AI and the hotline`,
      summary: `${plural(docs.length, "record")} describe${docs.length === 1 ? "s" : ""} how ${who} can meet the ${LABEL[attr] ?? attr.replace(/_/g, " ")}, or what happens when they cannot, but ${docs.length === 1 ? "it is" : "they are"} outside the sources the AI can read. Documents it can read give only the general rule, so ${who} may be turned away.`,
      severity: "high",
      confidence: 88,
      evidence: [
        ...docs.slice(0, 3).map((i) => ({ label: i.doc.isAuthority ? "Declared record" : "Report", docId: i.doc.id, quote: highlight(i.claim.quote, i.claim.value) })),
        { label: "What the AI can read", docId: rule.doc.id, quote: highlight(rule.claim.quote, rule.claim.value) },
      ],
      docIds: [...new Set([...docs.map((i) => i.doc.id), ...general.slice(0, 2).map((i) => i.doc.id)])],
      claimKeys: [claimKey],
      fingerprint: fp("bias", "coverage-gap", attr, who),
    });
  }
  const hiddenOthers = ctxs.filter((c) => c.inAiScope === false && !covered.has(c.id));
  if (hiddenOthers.length) {
    candidates.push({
      type: "bias",
      kind: "out-of-scope",
      title: `${plural(hiddenOthers.length, "record")} ${hiddenOthers.length === 1 ? "is" : "are"} excluded from the AI's sources`,
      summary: `${hiddenOthers.map((c) => c.title).join("; ")} ${hiddenOthers.length === 1 ? "is" : "are"} marked out of scope, so the AI will not see ${hiddenOthers.length === 1 ? "it" : "them"}. Check that nothing important is being left out.`,
      severity: "low",
      confidence: 70,
      evidence: hiddenOthers.slice(0, 3).map((c) => ({ label: "Excluded", docId: c.id, quote: `${c.title}${c.custody.length ? `, kept in ${c.custody.join(", ").replace(/_/g, " ")}` : ""}` })),
      docIds: hiddenOthers.map((c) => c.id),
      claimKeys: [],
      fingerprint: fp("bias", "out-of-scope", hiddenOthers.map((c) => c.name).sort().join(",")),
    });
  }

  /* --- sources that only repeat others, and repeat something out of date (bias) --- */
  const claimsByOrigin = new Map<string, number>();
  // A claim that contradicts the authoritative record is not original, useful work, so it does not count here.
  for (const cl of claims) if (cl.status !== "review") claimsByOrigin.set(cl.originDocId, (claimsByOrigin.get(cl.originDocId) ?? 0) + 1);
  const echoUnits: { unit: string; docs: Ctx[]; repeated: EngineClaim[] }[] = [];
  for (const unit of [...new Set(ctxs.map((c) => c.producedBy))]) {
    const docsOf = ctxs.filter((c) => c.producedBy === unit);
    const own = docsOf.reduce((n, d) => n + (claimsByOrigin.get(d.id) ?? 0), 0);
    const repeated = claims.filter((cl) => cl.originDocId && !docsOf.some((d) => d.id === cl.originDocId) && cl.citedByDocIds.some((id) => docsOf.some((d) => d.id === id)));
    if (own === 0 && repeated.some((cl) => cl.status === "superseded")) echoUnits.push({ unit, docs: docsOf, repeated });
  }
  if (echoUnits.length) {
    const stale = (u: (typeof echoUnits)[number]) => u.repeated.filter((cl) => cl.status === "superseded");
    const all = echoUnits.flatMap((u) => stale(u));
    const one = echoUnits.length === 1;
    candidates.push({
      type: "bias",
      kind: "echo",
      title: one ? `${echoUnits[0].unit} only repeats other sources` : `${echoUnits.length} teams only repeat other sources`,
      summary: one
        ? `It has not introduced any original claims, but it restates ${plural(echoUnits[0].repeated.length, "claim")} from elsewhere, including ${plural(stale(echoUnits[0]).length, "that is out of date", "that are out of date")}. Readers may take the repetition as separate support.`
        : `${echoUnits.map((u) => u.unit).join(", ")} have not introduced any original claims, but they restate claims from elsewhere, including out-of-date ones. Readers may take the repetition as separate support.`,
      severity: "low",
      confidence: 78,
      evidence: echoUnits.slice(0, 3).map((u) => {
        const cl = stale(u)[0];
        return { label: one ? "Repeats" : u.unit, docId: u.docs.find((d) => cl.citedByDocIds.includes(d.id))?.id, quote: cl.text };
      }),
      docIds: [...new Set(echoUnits.flatMap((u) => u.docs.map((d) => d.id)))],
      claimKeys: [...new Set(all.map((cl) => cl.key))],
      fingerprint: one ? fp("bias", "echo", echoUnits[0].unit) : fp("bias", "echo", echoUnits.map((u) => u.unit).sort().join("+")),
    });
  }

  /* --- outdated or harmful language (bias) --- */
  for (const c of ctxs) {
    const flags = c.input.ex.languageFlags;
    if (!flags.length) continue;
    candidates.push({
      type: "bias",
      kind: "terminology",
      title: `${c.title} uses outdated terminology`,
      summary: `${[...new Set(flags.map((f) => f.concern.replace(/\.$/, "")))].slice(0, 3).join(". ")}. Consider reparative description.`,
      severity: "medium",
      confidence: 75,
      evidence: [...new Map(flags.map((f) => [f.quote, f])).values()].slice(0, 3).map((f) => ({ label: "Wording", docId: c.id, quote: f.quote })),
      docIds: [c.id],
      claimKeys: [],
      fingerprint: fp("bias", "terminology", c.name),
    });
  }

  /* --- one organisation dominates the collection (bias) --- */
  if (ctxs.length >= 5) {
    const counts = new Map<string, Ctx[]>();
    for (const c of ctxs) counts.set(c.organisation, [...(counts.get(c.organisation) ?? []), c]);
    const [org, list] = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    if (counts.size >= 2 && list.length / ctxs.length >= 0.7) {
      candidates.push({
        type: "bias",
        kind: "representation",
        title: `${list.length} of ${ctxs.length} documents come from ${org}`,
        summary: "The collection mostly reflects one organisation's own account. Documents from other organisations or perspectives would test it.",
        severity: "medium",
        confidence: 70,
        evidence: [],
        docIds: list.map((c) => c.id),
        claimKeys: [],
        fingerprint: fp("bias", "representation", org),
      });
    }
  }

  /* --- integrity: registry manifest vs the files actually uploaded --- */
  for (const c of ctxs) {
    const text = c.input.doc.text;
    if (!text || c.input.doc.ext !== "json") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    const entries = (parsed as { documents?: { file?: string; sha256?: string }[] })?.documents;
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      if (!e?.file || !e.sha256) continue;
      const target = ctxs.find((x) => x.name.toLowerCase() === e.file!.toLowerCase());
      if (!target || target.input.doc.sha256 === e.sha256) continue;
      candidates.push({
        type: "disinformation",
        kind: "altered",
        title: `${target.title} no longer matches its registered fingerprint`,
        summary: "The file's SHA-256 changed after it was registered. Someone edited it, or the file was replaced.",
        severity: "high",
        confidence: 99,
        evidence: [
          { label: "Registered", docId: c.id, quote: `${e.sha256.slice(0, 12)}…${e.sha256.slice(-8)}`, mono: true },
          { label: "Now", docId: target.id, quote: `${target.input.doc.sha256.slice(0, 12)}…${target.input.doc.sha256.slice(-8)}`, mono: true },
        ],
        docIds: [target.id, c.id],
        claimKeys: [],
        fingerprint: fp("disinformation", "altered", target.name, target.input.doc.sha256),
      });
    }
  }

  /* --- citations to authorities that are not in the register --- */
  const registerDocs = ctxs.filter((c) => c.input.doc.text && /^\s*#?\s*authority\s*,[^\n]*status/im.test(c.input.doc.text));
  if (registerDocs.length) {
    const known = new Set<string>();
    for (const r of registerDocs) for (const m of r.input.doc.text!.matchAll(/\b20\d{2}\/\d{8}\b/g)) known.add(m[0]);
    const cited = new Map<string, Ctx[]>();
    for (const c of ctxs) {
      if (registerDocs.includes(c)) continue;
      for (const n of new Set([...(c.input.ex.authorityNumbers ?? []), ...(c.input.doc.text?.match(/\b20\d{2}\/\d{8}\b/g) ?? [])])) {
        if (!known.has(n)) cited.set(n, [...(cited.get(n) ?? []), c]);
      }
    }
    for (const [num, list] of cited) {
      candidates.push({
        type: "disinformation",
        kind: "citation",
        title: `Records Authority ${num} is not in the register`,
        summary: `${list.length} ${list.length === 1 ? "document cites" : "documents cite"} it, but the NAA register extract does not list it. It may be a typo or an invented reference.`,
        severity: "high",
        confidence: 85,
        evidence: list.slice(0, 3).map((d) => {
          const line = (d.input.doc.text ?? "").split(/\r?\n/).find((l) => l.includes(num)) ?? num;
          return { label: "Cited in", docId: d.id, quote: line.trim().replace(num, `[[${num}]]`) };
        }),
        docIds: [...list.map((d) => d.id), ...registerDocs.map((r) => r.id)],
        claimKeys: [],
        fingerprint: fp("disinformation", "citation", num),
      });
    }
  }

  /* --- AI-written content nobody has reviewed. Added last so it can say what was found against it. --- */
  for (const c of ctxs) {
    if (!c.aiGenerated) continue;
    const against = candidates.filter((f) => f.docIds.includes(c.id));
    const inScope = c.inAiScope !== false;
    const where = c.custody.length ? `the ${c.custody.join(", ").replace(/_/g, " ")}` : "a shared location";
    candidates.push({
      type: "disinformation",
      kind: "ai-unreviewed",
      title: `${c.title} was written by an AI and has not been reviewed`,
      summary: `${against.length ? `${plural(against.length, "problem")} ${against.length === 1 ? "was" : "were"} found in it. ` : ""}It is stored in ${where}${inScope ? ", where the AI assistant can read it and may repeat its mistakes as if they were fact" : ""}. A person has not checked it against the source records, so it cannot be relied on.`,
      severity: against.length && inScope ? "high" : "medium",
      confidence: 95,
      evidence: [{ label: "Provenance", docId: c.id, quote: `${c.title} · ${c.recordStatus ?? c.status} · ${longDate(c.date)} · no human review recorded` }],
      docIds: [c.id],
      claimKeys: [],
      fingerprint: fp("disinformation", "ai-unreviewed", c.name),
    });
  }

  /* de-duplicate claims by key (keep the first) */
  const seen = new Set<string>();
  const uniqueClaims = claims.filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)));

  return {
    docs: ctxs.map(({ input, refersToIds, ...d }) => {
      void input;
      void refersToIds;
      return d;
    }),
    claims: uniqueClaims,
    candidates,
  };
}
