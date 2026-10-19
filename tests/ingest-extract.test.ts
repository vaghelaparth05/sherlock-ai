import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { parseRecord, toDocumentRow } from "../src/lib/ingest.ts";
import { validateClaim, type RawClaim } from "../src/lib/extract.ts";

test("every corpus and incoming file has valid front matter", () => {
  for (const dir of ["data/corpus", "data/incoming"]) {
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const { meta, body } = parseRecord(readFileSync(`${dir}/${f}`, "utf8"));
      assert.equal(toDocumentRow(meta, body, "h", `${dir}/${f}`).id, f.replace(".md", ""));
    }
  }
});

test("front matter with an unknown unit is rejected", () => {
  const { meta, body } = parseRecord(readFileSync("data/corpus/D02.md", "utf8"));
  assert.throws(() => toDocumentRow({ ...meta, unit: "Ministry of Truth" }, body, "h", "p"), /Unknown unit/);
});

const text = "## Eligibility\n\nTo be eligible, a household must have a combined\nannual income below $120,000.\n\nThe grant is available to owner-occupiers only.";
const subjects = new Set(["income_threshold", "eligible_tenure", "other"]);
const raw = (over: Partial<RawClaim>): RawClaim => ({
  subject: "income_threshold", statement: "s", value: "120000", scope: "all applicants",
  effective_from: "", effective_to: "", quote: "a household must have a combined annual income below $120,000.", ...over,
});

test("quotes match after whitespace normalisation and get a location", () => {
  assert.deepEqual(validateClaim(raw({}), text, subjects), { ok: true, location: "paragraph 2" });
});

test("paraphrased quotes, unknown subjects and bad dates are rejected", () => {
  assert.equal(validateClaim(raw({ quote: "household income must be under $120,000" }), text, subjects).ok, false);
  assert.equal(validateClaim(raw({ subject: "vibes" }), text, subjects).ok, false);
  assert.equal(validateClaim(raw({ effective_from: "15 May 2026" }), text, subjects).ok, false);
  assert.equal(validateClaim(raw({ value: " " }), text, subjects).ok, false);
});
