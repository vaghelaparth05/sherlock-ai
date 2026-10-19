/**
 * Loads the 10 NAA sample documents and runs a real scan into the database, with no web server.
 *   npm run db:seed
 * Uses Gemini if GEMINI_API_KEY is set in .env.local, otherwise the offline rules scanner.
 */
import { loadEnv } from "./load-env.mts";

loadEnv();
const { loadNaaSample } = await import("../src/lib/samples");
const { startScan } = await import("../src/lib/scanner");
const { getScan } = await import("../src/lib/repo");

try {
  const sample = await loadNaaSample();
  console.log(`Sample collection: ${sample.name} (${sample.total} documents${sample.added ? `, ${sample.added} added` : ", already loaded"})`);
  const { id, provider } = await startScan(sample.id);
  console.log(`Scanning with the ${provider} scanner…`);
  for (;;) {
    await new Promise((r) => setTimeout(r, 800));
    const s = await getScan(id);
    if (!s) throw new Error("Scan disappeared.");
    process.stdout.write(`\r  ${String(Math.round(s.progress * 100)).padStart(3)}%  ${s.stage.padEnd(24)}`);
    if (s.status === "complete") {
      console.log(`\nDone: ${s.claimCount} claims, ${s.findingCount} findings.`);
      break;
    }
    if (s.status === "failed") throw new Error(s.error ?? "Scan failed.");
  }
} catch (e) {
  console.error("\nSeed failed:", (e as Error).message);
  process.exitCode = 1;
}
process.exit(process.exitCode ?? 0);
