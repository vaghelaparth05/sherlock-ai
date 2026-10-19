import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreDocument, type ClaimFacts, type DocFacts } from "../src/lib/scoring.ts";
import { decideGate } from "../src/lib/gate.ts";

const claim = (id: string, over: Partial<ClaimFacts> = {}): ClaimFacts => ({
  id, status: "current", supersededChanged: false, contradicted: false, agreements: 0, ...over,
});
const gateFor = (doc: DocFacts, claims: ClaimFacts[], band: string, overrides = []) =>
  decideGate({ scored: true, tampered: doc.tampered, laterDeclaredVersion: doc.laterDeclaredVersion, claims, band, overrides });

const D14: DocFacts = {
  unit: "unknown", function: "grant_payments", custody: ["external", "team_site"], recordStatus: "unknown",
  reviewDate: null, laterDeclaredVersion: false, tampered: false,
};

test("D14 forged fee notice: the worked example in the spec", () => {
  const claims = [claim("D14-C01", { contradicted: true }), claim("D14-C02", { contradicted: true })];
  const s = scoreDocument(D14, claims, "2026-07-15");
  assert.equal(s.provenance.score, 10);
  assert.equal(s.currency.score, 50);
  assert.equal(s.corroboration.score, 0);
  assert.equal(s.integrity.score, 40);
  assert.equal(s.trust, 24);
  assert.deepEqual([s.likelihood.level, s.consequence, s.risk, s.band], [4, 4, 16, "High"]);
  assert.equal(gateFor(D14, claims, s.band).status, "blocked");
});

test("D03 stale echo: medium risk, still blocked by its superseded claim", () => {
  const doc: DocFacts = { ...D14, unit: "Customer Service", function: "grant_eligibility", custody: ["team_site"], recordStatus: "final" };
  const claims = [claim("D03-C01", { status: "superseded", supersededChanged: true }), claim("D03-C02", { agreements: 3 })];
  const s = scoreDocument(doc, claims, "2026-07-01");
  assert.equal(s.provenance.score, 65);
  assert.equal(s.currency.score, 27.5);
  assert.equal(s.corroboration.score, 100);
  assert.equal(s.trust, 65);
  assert.equal(s.band, "Medium");
  const g = gateFor(doc, claims, s.band);
  assert.deepEqual([g.status, g.rule], ["blocked", 4]);
});

test("current declared guidelines are allowed", () => {
  const doc: DocFacts = { ...D14, unit: "Grants Policy", function: "grant_eligibility", custody: ["records_system"], recordStatus: "declared", reviewDate: "2027-05-15" };
  const claims = [claim("D02-C01", { agreements: 2 }), claim("D02-C02", { agreements: 1 })];
  const s = scoreDocument(doc, claims, "2026-07-01");
  assert.equal(s.trust, 95);
  assert.equal(s.band, "Low");
  assert.equal(gateFor(doc, claims, s.band).status, "allowed");
});

test("a later declared version blocks the old one and drops currency to 10", () => {
  const doc: DocFacts = { ...D14, unit: "Grants Policy", function: "grant_eligibility", custody: ["records_system"], recordStatus: "declared", laterDeclaredVersion: true };
  const s = scoreDocument(doc, [claim("D01-C01", { agreements: 2 })], "2026-07-01");
  assert.equal(s.currency.score, 10);
  assert.equal(gateFor(doc, [], s.band).rule, 3);
});

test("tampering: integrity 0, risk Extreme, blocked by rule 2", () => {
  const doc: DocFacts = { ...D14, unit: "Corporate Services", function: "internal_admin", custody: ["records_system"], recordStatus: "declared", tampered: true };
  const s = scoreDocument(doc, [claim("X-C01", { agreements: 2 })], "2026-07-01");
  assert.equal(s.integrity.score, 0);
  assert.deepEqual([s.risk, s.band], [25, "Extreme"]);
  assert.deepEqual([gateFor(doc, [], s.band).status, gateFor(doc, [], s.band).rule], ["blocked", 2]);
});

test("an override applies only to the rule it was written against", () => {
  const override = { actor: "Priya", reason: "Reviewed by hand", seq: 9, rule: 5 };
  assert.equal(gateFor(D14, [], "High", [override] as never).status, "allowed");
  assert.equal(gateFor({ ...D14, tampered: true }, [], "Extreme", [override] as never).status, "blocked");
});

test("unscored documents are quarantined", () => {
  const g = decideGate({ scored: false, tampered: false, laterDeclaredVersion: false, claims: [], band: null, overrides: [] });
  assert.equal(g.status, "quarantined");
});
