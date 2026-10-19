import { scoringConfig, taxonomy } from "./config.ts";
import { allDocuments } from "./ingest.ts";
import { allClaims } from "./extract.ts";
import { inAiScope, registerRows } from "./register.ts";

/**
 * Representation rating per subject: whose records sit behind the assistant's answers,
 * and which units hold relevant records it cannot read.
 */

export type BiasRating = "High" | "Medium" | "Low";

/** Concentration (Herfindahl) of shares. */
export const concentration = (counts: number[]) => {
  const total = counts.reduce((a, b) => a + b, 0);
  return total ? counts.reduce((h, n) => h + (n / total) ** 2, 0) : 1;
};

export function rate(gap: boolean, h: number): BiasRating {
  const high = h >= scoringConfig().bias.concentration_high;
  if (gap && high) return "High";
  if (gap || high) return "Medium";
  return "Low";
}

export function biasBySubject() {
  const tax = taxonomy();
  const byUnit = scoringConfig().bias.group_by === "unit";
  const docs = new Map(allDocuments().map((d) => [d.id, d]));
  const gates = new Map(registerRows().map((r) => [r.id, r.gate]));
  const groupOf = (docId: string) => {
    const d = docs.get(docId)!;
    return byUnit ? d.unit : (tax.regions[d.region]?.name ?? "Unknown region");
  };
  const claims = allClaims();

  return Object.entries(tax.subjects).map(([subject, { label }]) => {
    // Only sources the gate allows count, on both sides: a blocked record outside scope is not a usable gap.
    const onSubject = claims.filter((c) => c.subject === subject && gates.get(c.document_id) === "allowed");
    const inUse = onSubject.filter((c) => inAiScope(docs.get(c.document_id)!));
    const outside = onSubject.filter((c) => !inAiScope(docs.get(c.document_id)!));

    const counts = new Map<string, number>();
    for (const c of inUse) counts.set(groupOf(c.document_id), (counts.get(groupOf(c.document_id)) ?? 0) + 1);
    const h = concentration([...counts.values()]);
    const shares = [...counts].map(([group, n]) => ({ group, claims: n, share: n / inUse.length })).sort((a, b) => b.share - a.share);

    const gapGroups = new Map<string, Set<string>>();
    for (const c of outside) gapGroups.set(groupOf(c.document_id), (gapGroups.get(groupOf(c.document_id)) ?? new Set()).add(c.document_id));
    const gaps = [...gapGroups].map(([group, ids]) => {
      const units = [...new Set([...ids].map((id) => docs.get(id)!.unit))];
      const serves = [...new Set(units.map((u) => tax.units[u]?.serves).filter(Boolean))].join(" and ");
      return { group, serves, documents: [...ids].sort() };
    });

    const rating = rate(gaps.length > 0, h);
    const lead = !inUse.length
      ? `The assistant can read no allowed sources on ${label.toLowerCase()}.`
      : shares[0].share === 1
        ? `Answers on ${label.toLowerCase()} draw only on ${shares[0].group} records.`
        : `Answers on ${label.toLowerCase()} draw ${Math.round(shares[0].share * 100)}% on ${shares[0].group} records.`;
    const gapText = gaps.map(
      (g) =>
        ` ${g.group}${g.serves ? `, which serves ${g.serves},` : ""} holds ${g.documents.length} record${g.documents.length > 1 ? "s" : ""} on this subject that the assistant cannot read.`,
    );
    return { subject, label, rating, concentration: Math.round(h * 100) / 100, shares, gaps, message: lead + gapText.join("") };
  });
}
