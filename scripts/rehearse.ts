import { seedDemo } from "../src/lib/seed.ts";
import { addToScope, registerRows, reviewDocument, rescoreAll } from "../src/lib/register.ts";
import { arriveRecord } from "../src/lib/pipeline.ts";
import { decide } from "../src/lib/relate.ts";
import { issueRecalls } from "../src/lib/impact.ts";
import { ask } from "../src/lib/assistant.ts";
import { biasBySubject } from "../src/lib/bias.ts";

/**
 * `npm run rehearse`: the scripted demo, start to finish, through the same code the API uses.
 * Run it once online so every model result is cached; after that it (and the live demo, if
 * done in this order) works with SHERLOCK_OFFLINE=1. Resets the register at the end.
 */

const PRIYA = "Priya (information manager)";
const CSO = "CSO-014 (contributor)";
const row = (id: string) => registerRows().find((r) => r.id === id)!;
const step = (s: string) => console.log(`\n== ${s}`);

step("1. Before go-live: the register");
await seedDemo("data/corpus", () => {});
for (const id of ["D01", "D03", "D09", "D02"]) console.log(`${id} trust ${row(id).trust} ${row(id).band} ${row(id).gate}: ${row(id).gateReason}`);

step("2. Bias on proof of address, then add D12 and D20 to scope");
const pa = () => biasBySubject().find((b) => b.subject === "proof_of_address")!;
console.log(`${pa().rating}: ${pa().message}`);
addToScope("D12", PRIYA, "Close the remote-community gap on proof of address.");
addToScope("D20", PRIYA, "Close the remote-community gap on proof of address.");
console.log(`${pa().rating}: ${pa().message}`);

step("3. A hotline officer uploads the forwarded fee notice (D14)");
const d14 = (await arriveRecord("data/incoming/D14.md", CSO, true)).document;
console.log(`D14 trust ${d14.trust}, risk ${d14.risk} ${d14.band}, ${d14.gate}, review ${d14.review}`);
reviewDocument("D14", "reject", PRIYA, "Scam notice: unknown sender asking for a fee.");
console.log(`Priya rejects it: review ${row("D14").review}, readable by the assistant: ${row("D14").aiReadable}`);

step("4. Priya uploads Guidelines v3 (D21) and confirms the supersessions");
const { impact } = await arriveRecord("data/incoming/D21.md", PRIYA);
for (const p of impact.proposals.filter((p) => p.type === "supersedes")) {
  decide(p.relationship.id, "confirm", PRIYA, "Guidelines v3 declared 3 August 2026.");
  rescoreAll();
  const n = issueRecalls(p.relationship.id, PRIYA).length;
  console.log(`${p.relationship.id}: ${p.documents.length} documents affected, ${n} recall notices (${p.recall.map((r) => r.answerId).join(", ")})`);
}
console.log(`Still holds: ${impact.versions.stillHolds.map((s) => s.answerId).join(", ")}`);

step("5. Staff ask the assistant");
for (const q of ["Are renters eligible for the grant?", "When do applications close?", "Is there a fee to apply?"]) {
  const a = await ask(q, "CSO-014");
  console.log(`Q: ${q}${a.cached ? " (cache)" : ""}`);
  for (const s of a.sentences) console.log(`   ${s.text}  [${s.label}]`);
  if (!a.answered) console.log(`   ${a.note}`);
}

step("Reset");
await seedDemo("data/corpus", () => {});
console.log("Register reset to before go-live.");
