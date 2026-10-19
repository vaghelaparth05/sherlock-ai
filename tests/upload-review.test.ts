import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Real uploads, the two-user review flow, the data card, findings, the assistant check and the connector. */

process.env.SHERLOCK_DB = ":memory:";
process.env.SHERLOCK_OFFLINE = "1";
const { htmlToText, emailToText, textOf, NeedsOcr } = await import("../src/lib/text.ts");
const { sessionToken, userFromToken } = await import("../src/lib/session.ts");
const { seedDemo } = await import("../src/lib/seed.ts");
const { arriveRecord } = await import("../src/lib/pipeline.ts");
const { captureFile } = await import("../src/lib/ingest.ts");
const { documentDetail, reviewDocument, rescoreAll, ReviewError } = await import("../src/lib/register.ts");
const { dataCard } = await import("../src/lib/card.ts");
const { results } = await import("../src/lib/findings.ts");
const { checkAnswer } = await import("../src/lib/assistant.ts");
const { listTables, rowCaptures, ConnectorError } = await import("../src/lib/connector.ts");
const { entriesFor } = await import("../src/lib/ledger.ts");

/** A one-page PDF with a real text layer, with correct xref offsets. */
function pdfWith(line: string): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${`BT /F1 12 Tf 72 720 Td (${line}) Tj ET`.length} >>\nstream\nBT /F1 12 Tf 72 720 Td (${line}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = objects.map((o, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

test("text renditions: HTML, multipart email, a PDF text layer, and images held for OCR", async () => {
  assert.equal(htmlToText("<h1>Fees</h1><p>No fee is charged&nbsp;to apply.</p><script>x()</script>"), "Fees\n\nNo fee is charged to apply.");
  const eml = [
    "From: Grant Processing Centre <notices@example>",
    "Subject: URGENT",
    'Content-Type: multipart/alternative; boundary="b1"',
    "",
    "--b1",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    "A $50 processing fee must be paid before your application is =",
    "assessed.",
    "--b1--",
  ].join("\r\n");
  const mail = emailToText(eml);
  assert.match(mail, /^From: Grant Processing Centre/);
  assert.match(mail, /A \$50 processing fee must be paid before your application is assessed\./);
  const pdf = await textOf(pdfWith("Households must earn below $120,000 to be eligible for the grant."), "pdf");
  assert.match(pdf.text, /below \$120,000/);
  assert.match(pdf.method, /pdf text layer/);
  await assert.rejects(textOf(Buffer.from("not really a png"), "png"), NeedsOcr);
  await assert.rejects(textOf(pdfWith(""), "pdf"), NeedsOcr);
});

test("session tokens are signed: an edited token is refused", () => {
  const token = sessionToken("priya");
  assert.equal(userFromToken(token)?.role, "information_manager");
  assert.equal(userFromToken(token.replace("priya", "cso-014")), null);
  assert.equal(userFromToken(undefined), null);
});

test("a contributor's upload waits for review; approving a blocked record needs an override reason", async () => {
  await seedDemo("data/corpus", () => {});
  await arriveRecord("data/incoming/D14.md", "CSO-014 (contributor)", true);
  let d = documentDetail("D14")!;
  assert.deepEqual([d.review, d.inAiScope, d.aiReadable], ["awaiting", false, false]);

  const card = dataCard("D14")!;
  assert.equal(card.trust, 24);
  assert.equal(card.recommendation.action, "reject");
  assert.deepEqual(card.disinformation.map((s) => s.signal), ["Unknown creator", "Came from outside", "No record status", "Contradicts declared records"]);

  assert.throws(() => reviewDocument("D14", "approve", "Priya (information manager)", ""), ReviewError);
  reviewDocument("D14", "approve", "Priya (information manager)", "Testing the override path only.");
  d = documentDetail("D14")!;
  assert.deepEqual([d.review, d.aiReadable], ["approved", true]);
  assert.equal(entriesFor("D14", "GATE_OVERRIDE").length, 1);

  reviewDocument("D14", "reject", "Priya (information manager)", "It is a scam notice.");
  d = documentDetail("D14")!;
  assert.deepEqual([d.review, d.inAiScope, d.aiReadable], ["rejected", false, false]);
});

test("findings: D09's invented amount, the proof-of-address gap, and D14 as disinformation", () => {
  const ids = results().findings.map((f) => `${f.id}:${f.type}:${f.severity}`);
  assert.ok(ids.includes("M-D09-C02:misinformation:high"), ids.join(" "));
  assert.ok(ids.includes("B-proof_of_address:bias:high"), ids.join(" "));
  assert.ok(ids.includes("X-D14-C01:disinformation:high"), ids.join(" "));
});

test("the data card shows what approving D12 would do to representation", () => {
  const pa = dataCard("D12")!.bias.find((b) => b.subject === "proof_of_address")!;
  // Approving D12 gives Riverbend a voice, so the gap closes and concentration drops below 0.75.
  assert.deepEqual([pa.now, pa.ifApproved], ["High", "Low"]);
});

test("records with no text layer are kept and quarantined with a reason", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "sherlock-scan-"));
  const file = path.join(dir, "photo.jpg");
  writeFileSync(file, "pretend jpeg bytes");
  const row = await captureFile({
    sourcePath: file, ext: "jpg", actor: "CSO-014 (contributor)", reviewRequired: true,
    meta: { title: "Photo of a letter", unit: "unknown", function: "grant_payments", custody: ["external"], record_status: "unknown", date: "2026-07-16", in_ai_scope: false },
  });
  rescoreAll();
  const d = documentDetail(row.id)!;
  assert.match(row.id, /^U\d+$/);
  assert.equal(d.gate, "quarantined");
  assert.match(d.gateReason, /OCR/);
});

test("the assistant keeps only sentences that cite given claims, labelled by their weakest source", () => {
  const ctx = [
    { id: "D02-C01", documentId: "D02", documentTitle: "Guidelines v2", date: "2026-05-15", trust: 69, statement: "s", quote: "q", independentSources: 3 },
    { id: "D08-C01", documentId: "D08", documentTitle: "Payments", date: "2026-05-18", trust: 90, statement: "s", quote: "q", independentSources: 4 },
  ];
  const { kept, removed } = checkAnswer(
    [
      { text: "The threshold is $120,000.", claim_ids: ["D02-C01", "D08-C01"] },
      { text: "Most people get $5,000.", claim_ids: [] },
      { text: "Invented citation.", claim_ids: ["D99-C01"] },
    ],
    ctx,
  );
  assert.equal(kept.length, 1);
  assert.equal(kept[0].trust, 69);
  assert.equal(kept[0].label, "Trust 69 · consistent across 4 independent sources");
  assert.deepEqual(removed.map((r) => r.reason), ["removed: unsupported", "removed: unsupported"]);
});

test("the SQLite connector lists tables and turns rows into records; other sources are refused", () => {
  const tables = listTables("sqlite://data/demo-records.db");
  assert.deepEqual(tables.map((t) => [t.name, t.rows]), [["ministerial_correspondence", 3]]);
  const caps = rowCaptures("sqlite://data/demo-records.db", ["ministerial_correspondence"], {}, "Priya (information manager)");
  assert.equal(caps.length, 3);
  assert.deepEqual(caps[0].meta.custody, ["business_system"]);
  assert.equal(caps[0].meta.unit, "Ministerial Liaison");
  assert.throws(() => listTables("postgres://reader@db/records"), ConnectorError);
  assert.throws(() => listTables("sqlite://data/sherlock.db"), ConnectorError);
  assert.throws(() => listTables("sqlite:///etc/hosts"), ConnectorError);
});

test("a record's own front matter wins over batch provenance", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "sherlock-fm-"));
  const file = path.join(dir, "record.md");
  writeFileSync(file, "---\nid: T99\ntitle: Test record\nunit: Finance\nfunction: grant_payments\ncustody: [records_system]\nrecord_status: declared\ndate: 2026-08-01\nin_ai_scope: true\n---\n\nNo fee is charged to apply.\n");
  const row = await captureFile({
    sourcePath: file, ext: "md", actor: "Priya (information manager)", reviewRequired: false,
    meta: { title: "batch title", unit: "unknown", custody: ["team_site"], record_status: "final", date: "2026-10-19" },
  });
  assert.deepEqual([row.title, row.unit, row.custody, row.record_status, row.date], ["Test record", "Finance", '["records_system"]', "declared", "2026-08-01"]);
});
