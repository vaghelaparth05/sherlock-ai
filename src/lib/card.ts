import { taxonomy, scoringConfig } from "./config.ts";
import { documentDetail } from "./register.ts";
import { biasBySubject } from "./bias.ts";
import { arrivalImpact } from "./impact.ts";

/**
 * The data card the information manager reviews before approving an upload: the score in
 * plain words, the risk cell, misinformation and disinformation signals, what approval would
 * do to representation, and which documents and AI answers it touches.
 */

const CUSTODY_WORDS: Record<string, string> = {
  records_system: "the records system",
  regional_records_system: "the regional records system",
  team_site: "a managed team site",
  email: "email",
  personal_drive: "a personal drive",
  external: "outside the organisation",
};

export function dataCard(id: string) {
  const d = documentDetail(id);
  if (!d) return null;
  const tax = taxonomy();
  const fn = tax.functions[d.function];
  const s = d.score;
  const auth = scoringConfig().authority;

  const explain = s && {
    provenance: `${s.provenance.score}: ${
      s.provenance.authority === auth.owner
        ? `${d.unit} owns ${d.function.replace(/_/g, " ")}`
        : s.provenance.authority === auth.related
          ? `${d.unit} is related to ${d.function.replace(/_/g, " ")}, which ${fn.owner} owns`
          : d.unit === "unknown" ? "the creator is unknown" : `${d.unit} has no authority over ${d.function.replace(/_/g, " ")}`
    }; weakest custody link is ${CUSTODY_WORDS[d.custody.reduce((w, c) => (scoringConfig().custody[c] < scoringConfig().custody[w] ? c : w))]}.`,
    currency: `${s.currency.score}: ${
      s.currency.laterDeclaredVersion
        ? "a later declared version exists in this series"
        : `${s.currency.base === 100 ? "review date not yet passed" : "no review date, or it has passed"}${s.currency.supersededShare ? `; ${Math.round(s.currency.supersededShare * 100)}% of its claims are superseded` : ""}`
    }.`,
    corroboration: `${s.corroboration.score}: mean over its claims (0 contradicted or unsupported, 100 two or more independent sources, 60 one, 30 none).`,
    integrity: `${s.integrity.score}: ${s.integrity.tampered ? "the file no longer matches its hash at upload" : `record status is ${d.recordStatus.replace("_", " ")}`}.`,
  };

  const misinformation = d.claims
    .filter((c) => ["superseded", "corrected", "unsupported"].includes(c.status) || (c.contradictedBy.length > 0 && d.recordStatus === "ai_generated"))
    .map((c) => ({ claimId: c.id, status: c.status, quote: c.quote, location: c.location, replacedBy: c.replacedBy }));

  const contradicting = [...new Set(d.claims.flatMap((c) => c.contradictedBy.map((x) => x.split("-")[0])))];
  const disinformation = [
    d.unit === "unknown" && { signal: "Unknown creator", detail: "No business unit is recorded as creating this record." },
    d.custody.includes("external") && { signal: "Came from outside", detail: "Its custody chain starts outside the organisation." },
    d.recordStatus === "unknown" && { signal: "No record status", detail: "It is not declared, final or draft." },
    contradicting.length && d.recordStatus !== "ai_generated" && {
      signal: "Contradicts declared records",
      detail: `Its claims conflict with current declared records: ${contradicting.join(", ")}.`,
    },
    s?.integrity.tampered && { signal: "Altered after upload", detail: "The file's SHA-256 no longer matches the hash recorded at upload." },
  ].filter(Boolean) as { signal: string; detail: string }[];

  const subjects = new Set(d.claims.map((c) => c.subject));
  const before = new Map(biasBySubject().map((b) => [b.subject, b]));
  const bias = biasBySubject([id])
    .filter((b) => subjects.has(b.subject))
    .map((b) => ({ subject: b.subject, label: b.label, now: before.get(b.subject)!.rating, ifApproved: b.rating, message: b.message }));

  const recommendation =
    d.gate === "quarantined" ? { action: "wait", why: d.gateReason }
    : d.gate === "blocked" ? { action: "reject", why: `Blocked by gate rule ${d.gateDecision?.rule}: ${d.gateReason} Approving needs a written override.` }
    : { action: "approve", why: `Passes every gate rule at ${d.band} risk.` };

  return {
    document: { id: d.id, title: d.title, unit: d.unit, region: d.region, function: d.function, custody: d.custody, recordStatus: d.recordStatus, date: d.date, sha256: d.sha256, textMethod: d.reviewDetail.textMethod },
    review: d.reviewDetail,
    trust: d.trust,
    risk: { likelihood: d.likelihood, consequence: d.consequence, risk: d.risk, band: d.band },
    explain,
    gate: d.gateDecision,
    aiReadable: d.aiReadable,
    misinformation,
    disinformation,
    bias,
    impact: arrivalImpact(id),
    claims: d.claims,
    recommendation,
  };
}
