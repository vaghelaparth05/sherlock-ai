import { arriveRecord } from "../src/lib/pipeline.ts";

/**
 * CLI upload of a Markdown record: `npm run arrive data/incoming/D21.md` (as the information
 * manager) or add `--contributor` to submit it for review. Also pre-caches model results.
 */

const file = process.argv[2];
if (!file) throw new Error("Usage: npm run arrive <path to record> [--contributor]");
const contributor = process.argv.includes("--contributor");
const { document: d, impact, rejected } = await arriveRecord(file, contributor ? "CSO-014 (contributor)" : "Priya (information manager)", contributor);
console.log(`${d.id}: trust ${d.trust}, risk ${d.risk} ${d.band}, ${d.gate}, review ${d.review}. ${d.gateReason}`);
for (const r of rejected) console.log(`Rejected ${r.type} for ${r.newer} vs ${r.older}: ${r.problem}`);
for (const p of impact.proposals) {
  console.log(`${p.relationship.id} ${p.from.id} ${p.type} ${p.to.id} (${p.relationship.confidence}): ${p.relationship.rationale}`);
  console.log(`  documents: ${p.documents.map((x) => x.id).join(", ") || "none"}; recall: ${p.recall.map((x) => x.answerId).join(", ") || "none"}`);
}
for (const s of impact.versions.stillHolds) console.log(`  ${s.answerId}: ${s.note}`);
