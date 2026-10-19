import { verifyIntegrity } from "../src/lib/register.ts";

/** `npm run verify`: re-hash every original, log any tampering, and check the ledger's hash chain. */

const r = verifyIntegrity();
console.log(r.chain.ok ? `Ledger chain intact: ${r.chain.entries} entries.` : `Ledger chain BROKEN at entry ${r.chain.brokenAt}: ${r.chain.problem}`);
console.log(r.mismatched.length ? `${r.mismatched.length} original(s) changed since ingest:` : `All ${r.documents} originals match their hash at ingest.`);
for (const m of r.mismatched) console.log(`  ${m.id} ${m.title}: expected ${m.expected.slice(0, 12)}…, now ${m.observed.slice(0, 12)}…`);
if (!r.chain.ok || r.mismatched.length) process.exitCode = 1;
