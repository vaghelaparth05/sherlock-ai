import { createHash } from "node:crypto";
import { NUMBER_TOKEN, numberFromToken } from "@/lib/text";
import { GLOBAL_ATTRIBUTES, type Attribute, type CandidateFinding, type DocInput, type ExtractedClaim, type ExtractedDoc } from "@/lib/scanner/types";
import type { ClaimStatus, Evidence, Severity } from "@/lib/types";

/**
 * Deterministic analysis. The AI (or the rules scanner) only EXTRACTS structured facts
 * from each document. Everything that decides whether two facts conflict, which one is
 * current, who the original source is, and whether a file was altered happens here, in
 * code, so results are reproducible and every finding can point at its evidence.
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
}

export interface EngineClaim {
  key: string;
  text: string;
  attribute: Attribute;
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

/* ---------- helpers ---------- */

const STOP = new Set(["the", "of", "and", "for", "a", "an", "to", "in", "on", "file", "record", "all", "any"]);
const ATTR_LABEL: Record<Attribute, string> = {
  retention_period: "retention period",
  transfer_age: "transfer age",
  access_period: "open access period",
  disposal_action: "disposal action",
  security_classification: "security classification",
  custodian: "custodian",
  other: "figure",
};

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

function durationYears(v: string): number | null {
  const m = v.match(new RegExp(`(${NUMBER_TOKEN})\\s+(year|month|day)s?`, "i"));
  if (!m) return null;
  const n = numberFromToken(m[1]);
  if (n === null) return null;
  const unit = m[2].toLowerCase();
  return unit === "year" ? n : unit === "month" ? n / 12 : n / 365;
}
/** Canonical key so "10 years" and "ten years" compare equal. */
function valueKey(v: string): string {
  const y = durationYears(v);
  return y !== null ? `dur:${Math.round(y * 100) / 100}` : `txt:${normText(v)}`;
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
  const i = quote.toLowerCase().indexOf(value.toLowerCase());
  return i === -1 ? quote : `${quote.slice(0, i)}[[${quote.slice(i, i + value.length)}]]${quote.slice(i + value.length)}`;
}

const monthYear = (iso: string | null) => {
  if (!iso) return "an undated";
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
};

/* ---------- main ---------- */

interface Ctx extends EngineDoc {
  input: EngineInput;
  refersToIds: string[];
}

interface Instance {
  doc: Ctx;
  claim: ExtractedClaim;
  vkey: string;
}

export function analyse(inputs: EngineInput[]): EngineResult {
  /* --- document context --- */
  const ctxs: Ctx[] = inputs.map(({ doc, ex }) => ({
    id: doc.id,
    name: doc.name,
    title: ex.title || doc.name,
    producedBy: ex.producedBy,
    organisation: ex.organisation || ex.producedBy,
    date: ex.date,
    year: ex.date ? Number(ex.date.slice(0, 4)) : null,
    docType: ex.docType,
    status: ex.status,
    isAuthority: /authority/i.test(ex.docType) && !/register/i.test(ex.docType),
    isRegister: /register|registry/i.test(ex.docType),
    input: { doc, ex },
    refersToIds: [],
  }));
  for (const c of ctxs) {
    for (const ref of c.input.ex.refersTo) {
      const r = normText(ref);
      const hit = ctxs.find((o) => o.id !== c.id && (normText(o.title).includes(r) || r.includes(normText(o.title))));
      if (hit) c.refersToIds.push(hit.id);
    }
  }
  const dateOf = (c: Ctx) => c.date ?? "9999-12-31";

  /* --- group claims --- */
  const instances: Instance[] = [];
  for (const c of ctxs) for (const cl of c.input.ex.claims) instances.push({ doc: c, claim: cl, vkey: valueKey(cl.value) });

  interface Group {
    key: string;
    attribute: Attribute;
    subject: string;
    subjectTokens: string[];
    instances: Instance[];
  }
  const groups: Group[] = [];
  for (const inst of instances) {
    if (inst.claim.attribute === "other") continue;
    const global = GLOBAL_ATTRIBUTES.includes(inst.claim.attribute);
    const toks = global ? ["_all"] : tokens(inst.claim.subject);
    let g = groups.find((x) => x.attribute === inst.claim.attribute && jaccard(x.subjectTokens, toks) >= 0.5);
    if (!g) {
      g = {
        key: `${inst.claim.attribute}|${global ? "all" : toks.join(" ")}`,
        attribute: inst.claim.attribute,
        subject: global ? "public access to Commonwealth records" : inst.claim.subject.toLowerCase(),
        subjectTokens: toks,
        instances: [],
      };
      groups.push(g);
    }
    g.instances.push(inst);
  }

  const claims: EngineClaim[] = [];
  const candidates: CandidateFinding[] = [];
  const claimKeyFor = (g: Group, vkey: string) => `${g.key}|${vkey}`;
  const outdatedValues = new Map<string, { value: string; authValue: string; authDoc: Ctx }>(); // claimKey -> info (for depends-on)

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

  for (const g of groups) {
    const byValue = new Map<string, Instance[]>();
    for (const i of g.instances) byValue.set(i.vkey, [...(byValue.get(i.vkey) ?? []), i]);
    const label = ATTR_LABEL[g.attribute];
    const subjLabel = cap(g.subject);
    const mkClaim = (vkey: string, status: ClaimStatus): EngineClaim => {
      const list = byValue.get(vkey)!;
      return {
        key: claimKeyFor(g, vkey),
        text: `${subjLabel}: ${label} is ${list[0].claim.value}`,
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
          title: `${subjLabel}: ${list[0].claim.value} rests on one original source`,
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
    const authInst = g.instances.filter((i) => i.doc.isAuthority && i.doc.status !== "superseded" && i.doc.status !== "withdrawn");
    const auth = authInst.length ? authInst.sort((a, b) => dateOf(b.doc).localeCompare(dateOf(a.doc)))[0] : null;

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

        /* a later document disagrees with the authority */
        for (const i of laterThanAuthority) {
          claims.push({ ...mkClaim(vkey, "review"), key: `${claimKeyFor(g, vkey)}|${i.doc.id}`, citedByDocIds: [i.doc.id], originDocId: i.doc.id });
          candidates.push({
            type: "misinformation",
            kind: "contradicts-authority",
            title: `${i.doc.title} disagrees with the Records Authority on ${g.attribute === "access_period" ? "public access" : g.subject}`,
            summary: `It says ${i.claim.value}; the authority says ${auth.claim.value}. The document is dated after the authority, so it may have been changed or misread.`,
            severity: "high",
            confidence: 90,
            evidence: [
              { label: "This document", docId: i.doc.id, quote: highlight(i.claim.quote, i.claim.value) },
              authEv,
            ],
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
            title: `${subjLabel}: ${list[0].claim.value} rests on one original source`,
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
                title: `${g.attribute === "access_period" ? "Public access after" : subjLabel + ":"} ${list[0].claim.value} is out of date`,
                summary: `The ${auth.doc.docType} dated ${monthYear(auth.doc.date)} sets ${auth.claim.value}. ${affected.length} current ${affected.length === 1 ? "document still states" : "documents still state"} ${list[0].claim.value}.`,
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
          title: `${subjLabel}: ${list[0].claim.value} has been replaced`,
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
        title: `${subjLabel}: ${[...byValue.values()].map((l) => l[0].claim.value).join(" versus ")}`,
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
  for (const inst of instances) {
    const b = inst.claim.basedOn;
    if (!b) continue;
    const btoks = tokens(b.subject);
    const g = groups.find((x) => x.attribute === b.attribute && jaccard(x.subjectTokens, btoks) >= 0.5);
    const bkey = valueKey(b.value);
    const baseKey = g ? claimKeyFor(g, bkey) : null;
    const outdated = baseKey ? outdatedValues.get(baseKey) : undefined;
    const claimKey = `dep|${inst.doc.id}|${normText(inst.claim.subject)}`;
    claims.push({
      key: claimKey,
      text: `${cap(inst.claim.subject)}: ${inst.claim.value}`,
      attribute: "other",
      subject: inst.claim.subject.toLowerCase(),
      value: inst.claim.value,
      originDocId: inst.doc.id,
      citedByDocIds: [inst.doc.id],
      status: outdated ? "review" : "single",
    });
    if (outdated && baseKey) {
      candidates.push({
        type: "misinformation",
        kind: "depends-on",
        title: `${cap(inst.claim.subject)} is built on an outdated figure`,
        summary: `The ${inst.claim.value} figure assumes ${b.value}, but the current source says ${outdated.authValue}. It needs recalculating.`,
        severity: "medium",
        confidence: 88,
        evidence: [
          { label: "Depends on", docId: inst.doc.id, quote: highlight(highlight(inst.claim.quote, b.value), inst.claim.value) },
          { label: "Current", docId: outdated.authDoc.id, quote: highlight(instances.find((i) => i.doc.id === outdated.authDoc.id && valueKey(i.claim.value) === valueKey(outdated.authValue))?.claim.quote ?? "", outdated.authValue) },
        ],
        docIds: [inst.doc.id, outdated.authDoc.id],
        claimKeys: [claimKey, baseKey],
        fingerprint: fp("misinformation", "depends-on", inst.doc.id, claimKey),
      });
    }
  }

  /* --- documents that state periods without citing an authority --- */
  for (const c of ctxs) {
    if (c.isAuthority || c.isRegister || c.status === "superseded" || c.input.ex.authorityNumbers.length) continue;
    const periodClaims = c.input.ex.claims.filter((cl) => ["retention_period", "transfer_age", "access_period"].includes(cl.attribute));
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

  /* --- sources that only repeat others (bias) --- */
  const claimsByOrigin = new Map<string, number>();
  for (const cl of claims) claimsByOrigin.set(cl.originDocId, (claimsByOrigin.get(cl.originDocId) ?? 0) + 1);
  const unitNames = [...new Set(ctxs.map((c) => c.producedBy))];
  for (const unit of unitNames) {
    const docsOf = ctxs.filter((c) => c.producedBy === unit);
    const own = docsOf.reduce((n, d) => n + (claimsByOrigin.get(d.id) ?? 0), 0);
    const repeated = claims.filter((cl) => cl.originDocId && !docsOf.some((d) => d.id === cl.originDocId) && cl.citedByDocIds.some((id) => docsOf.some((d) => d.id === id)));
    if (own === 0 && repeated.length >= 2) {
      candidates.push({
        type: "bias",
        kind: "echo",
        title: `${unit} only repeats other sources`,
        summary: `It has not introduced any original claims, but it restates ${repeated.length} claims from elsewhere. Readers may take the repetition as separate support.`,
        severity: "low",
        confidence: 78,
        evidence: repeated.slice(0, 2).map((cl) => ({ label: "Repeats", docId: docsOf.find((d) => cl.citedByDocIds.includes(d.id))?.id, quote: cl.text })),
        docIds: docsOf.map((d) => d.id),
        claimKeys: repeated.map((cl) => cl.key),
        fingerprint: fp("bias", "echo", unit),
      });
    }
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
    if (list.length / ctxs.length >= 0.7) {
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
