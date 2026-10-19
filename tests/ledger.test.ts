import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SHERLOCK_DB = ":memory:";
const { db } = await import("../src/lib/db.ts");
const { append, verifyChain, GENESIS_HASH } = await import("../src/lib/ledger.ts");

test("the ledger chains, refuses edits, and detects tampering", () => {
  const first = append({ actor: "Priya", action: "INGEST", targetType: "document", targetId: "D01", payload: { a: 1 } });
  append({ actor: "Priya", action: "SCOPE_ADD", targetType: "document", targetId: "D12", reason: "Bias gap" });
  append({ actor: "Sherlock", action: "EXTRACT", targetType: "document", targetId: "D01" });
  assert.equal(first.prev_hash, GENESIS_HASH);
  assert.deepEqual(verifyChain(), { ok: true, entries: 3 });

  assert.throws(() => db().exec("UPDATE ledger SET reason = 'x' WHERE seq = 2"), /append-only/);
  assert.throws(() => db().exec("DELETE FROM ledger WHERE seq = 2"), /append-only/);

  db().exec("DROP TRIGGER ledger_no_update");
  db().exec("UPDATE ledger SET reason = 'edited' WHERE seq = 2");
  const check = verifyChain();
  assert.equal(check.ok, false);
  assert.equal(!check.ok && check.brokenAt, 2);
});

test("documents cannot be updated or deleted", () => {
  db().exec(`INSERT INTO documents VALUES ('T1','t',NULL,NULL,'u','r',NULL,'f','[]','final','2026-01-01',NULL,1,'[]','body','h','p','now')`);
  assert.throws(() => db().exec("UPDATE documents SET text = 'changed' WHERE id = 'T1'"), /immutable/);
  assert.throws(() => db().exec("DELETE FROM documents WHERE id = 'T1'"), /immutable/);
});
