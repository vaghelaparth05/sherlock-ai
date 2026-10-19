import { arrive } from "../src/lib/pipeline.ts";

/** CLI version of an upload: `npm run arrive data/incoming/D14.md`. Also pre-caches model results. */

const file = process.argv[2];
if (!file) throw new Error("Usage: npm run arrive <path to record>");
const { document: d, impact, rejected } = await arrive(file, "Customer Service team site (upload)");
console.log(`${d.id}: trust ${d.trust}, risk ${d.risk} ${d.band}, ${d.gate}. ${d.gateReason}`);
for (const r of rejected) console.log(`Rejected ${r.type} for ${r.newer} vs ${r.older}: ${r.problem}`);
for (const p of impact.proposals) {
  console.log(`${p.relationship.id} ${p.from.id} ${p.type} ${p.to.id} (${p.relationship.confidence}): ${p.relationship.rationale}`);
  console.log(`  documents: ${p.documents.map((x) => x.id).join(", ") || "none"}; recall: ${p.recall.map((x) => x.answerId).join(", ") || "none"}`);
}
for (const s of impact.versions.stillHolds) console.log(`  ${s.answerId}: ${s.note}`);
