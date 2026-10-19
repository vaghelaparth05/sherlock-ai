import { seedDemo } from "../src/lib/seed.ts";
import { registerRows } from "../src/lib/register.ts";
import { biasBySubject } from "../src/lib/bias.ts";

/** Resets data/sherlock.db to the state before go-live and prints the register. */

const failed = await seedDemo();
console.table(
  registerRows().map((r) => ({ id: r.id, trust: r.trust, L: r.likelihood, C: r.consequence, risk: r.risk, band: r.band, gate: r.gate, scope: r.inAiScope })),
);
for (const b of biasBySubject()) console.log(`Bias ${b.subject}: ${b.rating}. ${b.message}`);
if (failed) process.exitCode = 1;
