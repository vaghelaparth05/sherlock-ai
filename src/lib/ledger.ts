import { db, transaction } from "./db.ts";
import { canonicalJson, sha256 } from "./hash.ts";

/**
 * Append-only, hash-chained ledger. Each entry stores the previous entry's hash, so any
 * edit, deletion or reordering breaks the chain. Every state change goes through append().
 */

export type LedgerAction =
  | "INGEST"
  | "EXTRACT"
  | "EXTRACT_REJECTED"
  | "PROPOSE_RELATIONSHIP"
  | "CONFIRM"
  | "DISMISS"
  | "CHANGE_RELATIONSHIP"
  | "SCOPE_ADD"
  | "GATE_OVERRIDE"
  | "RECALL_ISSUED"
  | "TAMPER_DETECTED";

export interface LedgerEntry {
  seq: number;
  ts_utc: string;
  actor: string;
  action: LedgerAction;
  target_type: string;
  target_id: string;
  payload_json: string;
  reason: string | null;
  prev_hash: string;
  entry_hash: string;
}

export interface LedgerInput {
  actor: string;
  action: LedgerAction;
  targetType: string;
  targetId: string;
  payload?: unknown;
  reason?: string;
}

export const GENESIS_HASH = "0".repeat(64);

function hashEntry(entry: Omit<LedgerEntry, "entry_hash">): string {
  const { seq, ts_utc, actor, action, target_type, target_id, payload_json, reason, prev_hash } = entry;
  return sha256(canonicalJson({ seq, ts_utc, actor, action, target_type, target_id, payload_json, reason, prev_hash }));
}

export function append(input: LedgerInput): LedgerEntry {
  return transaction(() => {
    const last = db().prepare("SELECT seq, entry_hash FROM ledger ORDER BY seq DESC LIMIT 1").get() as
      | { seq: number; entry_hash: string }
      | undefined;
    const base = {
      seq: (last?.seq ?? 0) + 1,
      ts_utc: new Date().toISOString(),
      actor: input.actor,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      payload_json: canonicalJson(input.payload ?? {}),
      reason: input.reason ?? null,
      prev_hash: last?.entry_hash ?? GENESIS_HASH,
    };
    const entry: LedgerEntry = { ...base, entry_hash: hashEntry(base) };
    db()
      .prepare(
        `INSERT INTO ledger (seq, ts_utc, actor, action, target_type, target_id, payload_json, reason, prev_hash, entry_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.seq, entry.ts_utc, entry.actor, entry.action, entry.target_type, entry.target_id,
        entry.payload_json, entry.reason, entry.prev_hash, entry.entry_hash,
      );
    return entry;
  });
}

export function allEntries(): LedgerEntry[] {
  return db().prepare("SELECT * FROM ledger ORDER BY seq").all() as unknown as LedgerEntry[];
}

export function entriesFor(targetId: string, action?: LedgerAction): LedgerEntry[] {
  const rows = db().prepare("SELECT * FROM ledger WHERE target_id = ? ORDER BY seq").all(targetId) as unknown as LedgerEntry[];
  return action ? rows.filter((r) => r.action === action) : rows;
}

export type ChainCheck =
  | { ok: true; entries: number }
  | { ok: false; entries: number; brokenAt: number; problem: string };

// ponytail: deleting entries from the tail is not detectable from the chain alone; anchor the head hash externally if that matters.
export function verifyChain(): ChainCheck {
  const rows = allEntries();
  let prev = GENESIS_HASH;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const fail = (problem: string): ChainCheck => ({ ok: false, entries: rows.length, brokenAt: r.seq, problem });
    if (r.seq !== i + 1) return fail(`Entry ${i + 1} is missing.`);
    if (r.prev_hash !== prev) return fail("Previous-hash link does not match.");
    if (hashEntry(r) !== r.entry_hash) return fail("Entry content does not match its hash.");
    prev = r.entry_hash;
  }
  return { ok: true, entries: rows.length };
}
