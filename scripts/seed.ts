import { readdirSync } from "node:fs";
import { resetDatabase } from "../src/lib/db.ts";
import { ingestFile } from "../src/lib/ingest.ts";
import { extractDocument } from "../src/lib/extract.ts";
import { registerRows, rescoreAll } from "../src/lib/register.ts";

/** Resets the demo database: ingests data/corpus, extracts claims, scores every document. */

const ACTOR = "Priya (setup)";
const PARALLEL = 4;

resetDatabase();
const docs = readdirSync("data/corpus")
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map((f) => ingestFile(`data/corpus/${f}`, ACTOR));
console.log(`Ingested ${docs.length} documents.`);

let failed = 0;
for (let i = 0; i < docs.length; i += PARALLEL) {
  await Promise.all(
    docs.slice(i, i + PARALLEL).map(async (d) => {
      try {
        const r = await extractDocument(d.id);
        console.log(`${d.id}: ${r.accepted} claims, ${r.rejected} rejected${r.cached ? " (cache)" : ""}`);
      } catch (e) {
        failed++;
        console.error(`${d.id}: extraction failed, left quarantined. ${e instanceof Error ? e.message : e}`);
      }
    }),
  );
}

rescoreAll();
console.table(
  registerRows().map((r) => ({ id: r.id, trust: r.trust, L: r.likelihood, C: r.consequence, risk: r.risk, band: r.band, gate: r.gate, scope: r.inAiScope })),
);
if (failed) process.exitCode = 1;
