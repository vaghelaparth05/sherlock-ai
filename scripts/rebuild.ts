import { rescoreAll, registerRows } from "../src/lib/register.ts";

/** `npm run rebuild`: recompute every score and gate from documents, claims and the ledger. */

rescoreAll();
console.table(registerRows().map((r) => ({ id: r.id, trust: r.trust, risk: r.risk, band: r.band, gate: r.gate, review: r.review, ai: r.aiReadable })));
