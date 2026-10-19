import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * SQLite store. Documents and the ledger are the record layer: triggers abort any
 * UPDATE or DELETE on them. Scores are derived and rebuilt from documents + ledger.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  series TEXT,
  version INTEGER,
  unit TEXT NOT NULL,
  region TEXT NOT NULL,
  creator TEXT,
  function TEXT NOT NULL,
  custody TEXT NOT NULL,              -- JSON array, origin first
  record_status TEXT NOT NULL,
  date TEXT NOT NULL,
  review_date TEXT,
  in_ai_scope_initial INTEGER NOT NULL,
  cites TEXT NOT NULL,                -- JSON array of document ids
  text TEXT NOT NULL,
  sha256 TEXT NOT NULL,               -- of the source file bytes at ingest
  source_path TEXT NOT NULL,
  ingested_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  subject TEXT NOT NULL,
  statement TEXT NOT NULL,
  value TEXT NOT NULL,
  scope TEXT NOT NULL,
  effective_from TEXT,
  effective_to TEXT,
  quote TEXT NOT NULL,
  location TEXT NOT NULL,
  claim_hash TEXT NOT NULL,
  origin_claim_id TEXT,
  is_echo INTEGER NOT NULL DEFAULT 0,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger (
  seq INTEGER PRIMARY KEY,
  ts_utc TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  reason TEXT,
  prev_hash TEXT NOT NULL,
  entry_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scores (
  document_id TEXT PRIMARY KEY REFERENCES documents(id),
  provenance REAL,
  currency REAL,
  corroboration REAL,
  integrity REAL,
  trust REAL,
  likelihood INTEGER,
  consequence INTEGER,
  risk INTEGER,
  band TEXT,
  gate TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  computed_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS documents_no_update BEFORE UPDATE ON documents
BEGIN SELECT RAISE(ABORT, 'documents are immutable'); END;
CREATE TRIGGER IF NOT EXISTS documents_no_delete BEFORE DELETE ON documents
BEGIN SELECT RAISE(ABORT, 'documents are immutable'); END;
CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger
BEGIN SELECT RAISE(ABORT, 'the ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON ledger
BEGIN SELECT RAISE(ABORT, 'the ledger is append-only'); END;
`;

let conn: DatabaseSync | undefined;

export function db(): DatabaseSync {
  if (!conn) {
    const file = process.env.SHERLOCK_DB ?? path.join(process.cwd(), "data", "sherlock.db");
    if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
    conn = new DatabaseSync(file);
    conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    conn.exec(SCHEMA);
  }
  return conn;
}

/** Wipes the demo database and recreates the schema. Only scripts/seed.ts calls this. */
export function resetDatabase(): void {
  db().exec("DROP TABLE IF EXISTS scores; DROP TABLE IF EXISTS claims; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS documents;");
  db().exec(SCHEMA);
}

/** Runs `fn` in one transaction. Nested calls join the outer transaction. */
export function transaction<T>(fn: () => T): T {
  const d = db();
  if (d.isTransaction) return fn();
  d.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    d.exec("COMMIT");
    return result;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
