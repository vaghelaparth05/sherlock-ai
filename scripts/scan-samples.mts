/**
 * Runs the real scanner engine over a sample set without the web app or database.
 *   npm run scan:samples                 NAA records authority set, offline rules scanner
 *   npm run scan:samples -- corpus       the Riverbend grant corpus
 *   npm run scan:samples -- corpus gemini   use Gemini (needs GEMINI_API_KEY in .env.local)
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyse } from "../src/lib/scanner/engine";
import { applyFrontMatter } from "../src/lib/scanner/meta";
import { rulesProvider } from "../src/lib/scanner/rules-provider";
import { extractText } from "../src/lib/text";
import type { DocInput } from "../src/lib/scanner/types";

const set = process.argv.includes("corpus") ? "corpus" : "naa";
const dir = join(process.cwd(), "samples", set);
const docs: DocInput[] = [];
for (const name of readdirSync(dir).sort()) {
  if (name.startsWith(".")) continue;
  const bytes = readFileSync(join(dir, name));
  const ext = name.split(".").pop()!.toLowerCase();
  docs.push({
    id: name.replace(/\.[^.]+$/, "").slice(0, 3),
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
console.log(`Sample set: ${set}   Scanner: ${provider.label}${provider.model ? ` (${provider.model})` : ""}\n`);

const inputs = [];
for (const doc of docs) {
  const ex = applyFrontMatter(await provider.extract(doc), doc.text);
  console.log(`${doc.name.padEnd(48)} ${String(ex.claims.length).padStart(2)} claims | ${ex.docType} | ${ex.status}${ex.aiGenerated ? " | AI" : ""}${ex.inAiScope === false ? " | out of AI scope" : ""} | ${ex.date ?? "no date"}`);
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
