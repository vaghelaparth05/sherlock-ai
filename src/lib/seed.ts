import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { resetDatabase } from "./db.ts";
import { allDocuments, ingestFile } from "./ingest.ts";
import { allClaims, extractDocument } from "./extract.ts";
import { decide, relateAll } from "./relate.ts";
import { rescoreAll } from "./register.ts";
import { logAnswer } from "./impact.ts";

/**
 * The state before go-live: ingest the corpus, extract claims, propose relationships, record
 * the setup review as "Priya (setup)", load the logged AI answers, score. Returns how many failed.
 */

const ACTOR = "Priya (setup)";
const PARALLEL = 4;

type Cite = { document: string; subject: string };
interface SeedAnswer {
  id: string;
  ts_utc: string;
  staff_id: string;
  question: string;
  sentences: { text: string; cites: Cite[] }[];
}

export async function seedDemo(corpusDir = "data/corpus", log: (line: string) => void = console.log): Promise<number> {
  resetDatabase();
  const docs = readdirSync(corpusDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => ingestFile(path.join(corpusDir, f), ACTOR));
  log(`Ingested ${docs.length} documents.`);

  let failed = 0;
  for (let i = 0; i < docs.length; i += PARALLEL) {
    await Promise.all(
      docs.slice(i, i + PARALLEL).map(async (d) => {
        try {
          const r = await extractDocument(d.id);
          log(`${d.id}: ${r.accepted} claims, ${r.rejected} rejected${r.cached ? " (cache)" : ""}`);
        } catch (e) {
          failed++;
          log(`${d.id}: extraction failed, left quarantined. ${e instanceof Error ? e.message : e}`);
        }
      }),
    );
  }

  const { proposed, rejected } = await relateAll(allDocuments(), allClaims());
  for (const r of rejected) log(`Rejected ${r.type} for ${r.newer} vs ${r.older}: ${r.problem}`);
  for (const r of proposed) {
    log(`${r.id} ${r.from_claim_id} ${r.type} ${r.to_claim_id} (${r.confidence}): ${r.rationale}`);
    decide(r.id, "confirm", ACTOR, "Reviewed during setup before go-live.");
  }

  const claims = allClaims();
  const answers = JSON.parse(readFileSync("data/seed_answers.json", "utf8")) as SeedAnswer[];
  for (const a of answers) {
    const resolve = (c: Cite) => {
      const hit = claims.find((x) => x.document_id === c.document && x.subject === c.subject);
      if (!hit) throw new Error(`${a.id}: no ${c.subject} claim in ${c.document}.`);
      return hit.id;
    };
    const sentences = a.sentences.map((s) => ({ text: s.text, claim_ids: s.cites.map(resolve) }));
    logAnswer({
      id: a.id,
      ts_utc: a.ts_utc,
      staff_id: a.staff_id,
      question: a.question,
      answer_json: JSON.stringify({ sentences }),
      cited_claim_ids: JSON.stringify([...new Set(sentences.flatMap((s) => s.claim_ids))]),
    });
  }
  log(`Loaded ${answers.length} logged AI answers.`);

  rescoreAll();
  return failed;
}
