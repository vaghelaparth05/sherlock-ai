import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** The spec's expected outcomes, replayed offline from the committed model cache. */

process.env.SHERLOCK_DB = ":memory:";
process.env.SHERLOCK_OFFLINE = "1";
const { seedDemo } = await import("../src/lib/seed.ts");
const { registerRows, claimDetail, addToScope, rescoreAll, documentDetail } = await import("../src/lib/register.ts");
const { biasBySubject } = await import("../src/lib/bias.ts");
const { arriveRecord } = await import("../src/lib/pipeline.ts");
const { decide } = await import("../src/lib/relate.ts");
const { issueRecalls, recallNotices } = await import("../src/lib/impact.ts");
const { entriesFor, verifyChain } = await import("../src/lib/ledger.ts");

// Ingest from a copy so the tamper step can edit a file without touching the corpus.
const corpus = mkdtempSync(path.join(tmpdir(), "sherlock-corpus-"));
cpSync("data/corpus", corpus, { recursive: true });

const gates = () => Object.fromEntries(registerRows().map((r) => [r.id, r.gate]));
const proofOfAddress = () => biasBySubject().find((b) => b.subject === "proof_of_address")!;

test("after seed", async () => {
  assert.equal(await seedDemo(corpus, () => {}), 0);
  const g = gates();
  for (const id of ["D01", "D03", "D04", "D05", "D09"]) assert.equal(g[id], "blocked", id);
  for (const id of ["D02", "D08", "D10", "D15"]) assert.equal(g[id], "allowed", id);
  const scope = Object.fromEntries(registerRows().map((r) => [r.id, r.inAiScope]));
  assert.deepEqual([scope.D12, scope.D20], [false, false]);
});

test("the threshold claim: origin D01, superseded by D02, echoes counted once", () => {
  const d = claimDetail(registerRowsClaim("D01", "income_threshold"))!;
  assert.equal(d.origin.documentId, "D01");
  assert.equal(d.state.status, "superseded");
  assert.match(d.state.replacedBy!, /^D02-/);
  assert.deepEqual(d.echoes.map((e) => e.documentId).sort(), ["D03", "D04", "D05", "D09"]);
});

test("D09: the $5,000 claim is unsupported", () => {
  const amounts = documentDetail("D09")!.claims.find((c) => c.subject === "grant_amounts")!;
  assert.equal(amounts.status, "unsupported");
});

test("bias on proof of address: High, then Low once D12 and D20 are in scope", () => {
  assert.equal(proofOfAddress().rating, "High");
  addToScope("D12", "Priya", "Close the remote-community gap.");
  addToScope("D20", "Priya", "Close the remote-community gap.");
  assert.equal(proofOfAddress().rating, "Low");
});

test("a contributor uploads D14: trust 24, risk 16 High, blocked, waiting for review", async () => {
  const { document: d } = await arriveRecord("data/incoming/D14.md", "CSO-014 (contributor)", true);
  assert.deepEqual([d.trust, d.risk, d.band, d.gate, d.review, d.aiReadable], [24, 16, "High", "blocked", "awaiting", false]);
});

test("upload D21 and confirm: supersessions, blocks and recalls", async () => {
  const { document: d, impact } = await arriveRecord("data/incoming/D21.md", "Priya (information manager)");
  assert.deepEqual([d.gate, d.review, d.aiReadable], ["allowed", "approved", true]);
  assert.equal(gates().D02, "blocked");
  assert.deepEqual(impact.versions.stillHolds.map((s) => s.answerId), ["A5"]);
  for (const p of impact.proposals.filter((p) => p.type === "supersedes")) {
    decide(p.relationship.id, "confirm", "Priya", "Guidelines v3 declared.");
    rescoreAll();
    issueRecalls(p.relationship.id, "Priya");
  }
  const recalled = [...new Set(recallNotices().map((n) => n.answerId))].sort();
  assert.deepEqual(recalled, ["A1", "A2", "A3", "A4"]);
  const g = gates();
  for (const id of ["D02", "D04", "D06", "D07", "D11", "D16", "D17", "D19"]) assert.equal(g[id], "blocked", id);
  assert.equal(g.D21, "allowed");
  assert.equal(verifyChain().ok, true);
});

test("edit a corpus file on disk: integrity 0, risk Extreme, TAMPER_DETECTED", () => {
  appendFileSync(path.join(corpus, "D08.md"), "\nEdited after ingest.\n");
  rescoreAll();
  const d = documentDetail("D08")!;
  assert.equal(d.score!.integrity.score, 0);
  assert.equal(d.band, "Extreme");
  assert.equal(entriesFor("D08", "TAMPER_DETECTED").length, 1);
});

function registerRowsClaim(doc: string, subject: string): string {
  return documentDetail(doc)!.claims.find((c) => c.subject === subject)!.id;
}
