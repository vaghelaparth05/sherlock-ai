/**
 * Runs the real scanner engine over samples/naa without the web app or database.
 *   npm run scan:samples            offline rules scanner
 *   npm run scan:samples -- gemini  Gemini scanner (needs GEMINI_API_KEY in .env.local)
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyse } from "../src/lib/scanner/engine";
import { rulesProvider } from "../src/lib/scanner/rules-provider";
import { extractText } from "../src/lib/text";
import type { DocInput } from "../src/lib/scanner/types";

const dir = join(process.cwd(), "samples", "naa");
const docs: DocInput[] = [];
for (const name of readdirSync(dir).sort()) {
  const bytes = readFileSync(join(dir, name));
  const ext = name.split(".").pop()!.toLowerCase();
  docs.push({
    id: name.slice(0, 2),
    name,
    ext,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    text: await extractText(bytes, ext),
    bytes,
  });
}

const wantGemini = process.argv.includes("gemini");
let provider = rulesProvider;
if (wantGemini) {
  const { loadEnv } = await import("./load-env.mts");
  loadEnv();
  const { geminiProvider } = await import("../src/lib/scanner/gemini-provider");
  provider = geminiProvider() as typeof rulesProvider;
}
console.log(`Scanner: ${provider.label}${provider.model ? ` (${provider.model})` : ""}\n`);

const inputs = [];
for (const doc of docs) {
  const ex = await provider.extract(doc);
  console.log(`${doc.name.padEnd(48)} ${ex.claims.length} claims | ${ex.docType} | ${ex.status} | ${ex.date ?? "no date"} | ${ex.organisation}`);
  inputs.push({ doc, ex });
}

const result = analyse(inputs);
const title = (id: string) => result.docs.find((d) => d.id === id)?.title ?? id;

console.log(`\n=== ${result.claims.length} claims ===`);
for (const c of result.claims) console.log(`  [${c.status.padEnd(10)}] ${c.text}  (origin ${c.originDocId}, in ${c.citedByDocIds.join(",")})`);

console.log(`\n=== ${result.candidates.length} findings ===`);
for (const f of result.candidates) {
  console.log(`\n[${f.type}/${f.kind}] ${f.severity} ${f.confidence}%  ${f.title}`);
  console.log(`  ${f.summary}`);
  console.log(`  docs: ${f.docIds.map(title).join(" | ")}`);
  for (const e of f.evidence) console.log(`    - ${e.label}: ${e.quote}`);
}

const by = (t: string) => result.candidates.filter((c) => c.type === t).length;
console.log(`\nTotals: misinformation ${by("misinformation")}, bias ${by("bias")}, disinformation ${by("disinformation")}`);
