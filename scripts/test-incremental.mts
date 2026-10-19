/**
 * Proves that scanning is incremental, against a throwaway database (sherlock_test).
 * Your real database is never touched.   npm run test:incremental
 *
 *  1. Scan the 10 sample documents: all are read.
 *  2. Make a decision on one finding.
 *  3. Add an 11th document and scan again: the first 10 are reused (not read again),
 *     only the new one is read, only its findings are new, and the decision is carried over.
 *  4. Change nothing and scan again: everything is reused and nothing is new.
 */
import pg from "pg";
import { loadEnv } from "./load-env.mts";

loadEnv();
const base = process.env.DATABASE_URL || "postgres://sherlock:sherlock@localhost:5435/sherlock";
const admin = new pg.Client({ connectionString: base.replace(/\/[^/]+$/, "/postgres") });
await admin.connect();
await admin.query("drop database if exists sherlock_test with (force)");
await admin.query("create database sherlock_test");
process.env.DATABASE_URL = base.replace(/\/[^/]+$/, "/sherlock_test");
process.env.SHERLOCK_SCANNER = "rules"; // deterministic, no network

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

try {
  const { loadNaaSample } = await import("../src/lib/samples");
  const { startScan } = await import("../src/lib/scanner");
  const { addDocument, decideFinding, getResults, listScanDocuments } = await import("../src/lib/repo");
  const { getScan } = await import("../src/lib/repo");

  const runScan = async (collectionId: string) => {
    const { id } = await startScan(collectionId);
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const s = await getScan(id);
      if (s?.status === "complete") return id;
      if (s?.status === "failed") throw new Error(s.error ?? "scan failed");
    }
    throw new Error("scan timed out");
  };

  const sample = await loadNaaSample();
  const scan1 = await runScan(sample.id);
  const docs1 = await listScanDocuments(scan1);
  const res1 = await getResults(scan1);
  check("first scan reads all 10 documents", docs1.length === 10 && docs1.every((d) => !d.reused), `${docs1.filter((d) => d.reused).length} reused`);
  check("first scan finds 11 issues", res1?.findings.length === 11, `${res1?.findings.length}`);

  const toDecide = res1!.findings.find((f) => f.kind === "supersedes")!;
  await decideFinding(toDecide.id, "confirmed", "test decision", "tester");

  await addDocument(
    sample.id,
    "11-regional-office-qa-2025.md",
    Buffer.from("Title: Regional Office Records Q&A 2025\nProduced by: DRIC Regional Office\nDate: 2025-02-10\nStatus: Current\nType: FAQ\n\n## How long do we keep routine grant correspondence?\nRoutine grant correspondence is kept for 5 years after action completed.\n"),
  );

  const scan2 = await runScan(sample.id);
  const docs2 = await listScanDocuments(scan2);
  const res2 = await getResults(scan2);
  const reused2 = docs2.filter((d) => d.reused);
  const fresh2 = docs2.filter((d) => !d.reused);
  check("second scan reuses the 10 earlier readings", reused2.length === 10, `${reused2.length} reused`);
  check("second scan reads only the new document", fresh2.length === 1 && fresh2[0].name.startsWith("11-"), fresh2.map((d) => d.name).join(", "));
  const newFindings = res2!.findings.filter((f) => f.isNew);
  check("only the new document's findings are new", newFindings.length === 2 && newFindings.every((f) => f.docIds.length > 0), newFindings.map((f) => f.kind).join(", "));
  const carried = res2!.findings.find((f) => f.title === toDecide.title);
  check("the earlier decision carried over", carried?.status === "confirmed" && carried.note === "test decision", `${carried?.status}`);
  check("earlier findings are unchanged", res2!.findings.length === 13, `${res2!.findings.length} total`);

  const scan3 = await runScan(sample.id);
  const docs3 = await listScanDocuments(scan3);
  const res3 = await getResults(scan3);
  check("a third scan with no changes reuses all 11", docs3.every((d) => d.reused), `${docs3.filter((d) => d.reused).length}/${docs3.length}`);
  check("and nothing is new", res3!.findings.every((f) => !f.isNew), `${res3!.findings.filter((f) => f.isNew).length} new`);
} catch (e) {
  console.error("Test crashed:", e);
  failures++;
} finally {
  await admin.query("drop database if exists sherlock_test with (force)").catch(() => {});
  await admin.end();
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
