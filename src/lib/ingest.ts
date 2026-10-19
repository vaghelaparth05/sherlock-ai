import { readFileSync } from "node:fs";
import YAML from "yaml";
import { db, transaction } from "./db.ts";
import { sha256 } from "./hash.ts";
import { append } from "./ledger.ts";
import { scoringConfig, taxonomy } from "./config.ts";
import { NeedsOcr, textOf } from "./text.ts";

/** Reads a record file (Markdown + YAML front matter), hashes the bytes and stores it once. */

export const RECORD_STATUSES = ["declared", "final", "draft", "ai_generated", "unknown"] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export interface DocumentRow {
  id: string;
  title: string;
  series: string | null;
  version: number | null;
  unit: string;
  region: string;
  creator: string | null;
  function: string;
  custody: string; // JSON array
  record_status: RecordStatus;
  date: string;
  review_date: string | null;
  in_ai_scope_initial: number;
  cites: string; // JSON array
  text: string;
  sha256: string;
  source_path: string;
  ingested_at: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;

export function parseRecord(raw: string): { meta: Record<string, unknown>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error("Missing YAML front matter.");
  const meta = YAML.parse(m[1]);
  if (!meta || typeof meta !== "object") throw new Error("Front matter is not a mapping.");
  return { meta: meta as Record<string, unknown>, body: m[2].trim() };
}

function str(meta: Record<string, unknown>, key: string, required: boolean): string | null {
  const v = meta[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw new Error(`Provenance is missing "${key}".`);
    return null;
  }
  if (typeof v !== "string" && typeof v !== "number") throw new Error(`"${key}" must be text.`);
  return String(v);
}

function list(meta: Record<string, unknown>, key: string): string[] {
  const v = meta[key] ?? [];
  const arr = Array.isArray(v) ? v : [v];
  if (!arr.every((x) => typeof x === "string")) throw new Error(`"${key}" must be a list of text.`);
  return arr as string[];
}

/** Validates provenance metadata against the taxonomy and scoring config. Throws on anything unknown. */
export function toDocumentRow(meta: Record<string, unknown>, body: string, fileHash: string, sourcePath: string, opts: { allowEmptyBody?: boolean } = {}) {
  const tax = taxonomy();
  const id = str(meta, "id", true)!;
  if (!ID.test(id)) throw new Error(`Invalid document id "${id}".`);
  const unit = str(meta, "unit", true)!;
  if (unit !== "unknown" && !tax.units[unit]) throw new Error(`Unknown unit "${unit}".`);
  const fn = str(meta, "function", true)!;
  if (!tax.functions[fn]) throw new Error(`Unknown business function "${fn}".`);
  const custody = list(meta, "custody");
  const known = scoringConfig().custody;
  if (!custody.length || custody.some((c) => known[c] === undefined)) {
    throw new Error(`Custody must be a list of: ${Object.keys(known).join(", ")}.`);
  }
  const status = str(meta, "record_status", true) as RecordStatus;
  if (!RECORD_STATUSES.includes(status)) throw new Error(`record_status must be one of ${RECORD_STATUSES.join(", ")}.`);
  const date = str(meta, "date", true)!;
  const review = str(meta, "review_date", false);
  if (!ISO_DATE.test(date) || (review && !ISO_DATE.test(review))) throw new Error("Dates must be YYYY-MM-DD.");
  const version = str(meta, "version", false);
  if (version !== null && !/^\d+$/.test(version)) throw new Error("version must be a whole number.");
  if (typeof meta.in_ai_scope !== "boolean") throw new Error('"in_ai_scope" must be true or false.');
  if (!body && !opts.allowEmptyBody) throw new Error("Document body is empty.");

  const row: DocumentRow = {
    id,
    title: str(meta, "title", true)!,
    series: str(meta, "series", false),
    version: version === null ? null : Number(version),
    unit,
    region: tax.units[unit]?.region ?? "unknown",
    creator: str(meta, "creator", false),
    function: fn,
    custody: JSON.stringify(custody),
    record_status: status,
    date,
    review_date: review,
    in_ai_scope_initial: meta.in_ai_scope ? 1 : 0,
    cites: JSON.stringify(list(meta, "cites")),
    text: body,
    sha256: fileHash,
    source_path: sourcePath,
    ingested_at: new Date().toISOString(),
  };
  return row;
}

export function getDocument(id: string): DocumentRow | undefined {
  return db().prepare("SELECT * FROM documents WHERE id = ?").get(id) as DocumentRow | undefined;
}

export function allDocuments(): DocumentRow[] {
  return db().prepare("SELECT * FROM documents ORDER BY id").all() as unknown as DocumentRow[];
}

function insertDocument(row: DocumentRow, actor: string, payload: Record<string, unknown>): DocumentRow {
  if (getDocument(row.id)) throw new Error(`${row.id} is already ingested. Originals are never replaced.`);
  return transaction(() => {
    const cols = Object.keys(row) as (keyof DocumentRow)[];
    db()
      .prepare(`INSERT INTO documents (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
      .run(...cols.map((c) => row[c]));
    append({
      actor,
      action: "INGEST",
      targetType: "document",
      targetId: row.id,
      payload: { sha256: row.sha256, source_path: row.source_path, title: row.title, ...payload },
    });
    return row;
  });
}

/** A Markdown record with front matter, e.g. the seeded corpus. `sourcePath` is relative to the repo root. */
export function ingestFile(sourcePath: string, actor: string): DocumentRow {
  const bytes = readFileSync(sourcePath);
  const { meta, body } = parseRecord(bytes.toString("utf8"));
  return insertDocument(toDocumentRow(meta, body, sha256(bytes), sourcePath), actor, { text_method: "markdown record", text_layer: true, review_required: false });
}

/** Ids for records that arrive without one: U01, U02, ... */
export function nextDocumentId(): string {
  const n = allDocuments().reduce((max, d) => Math.max(max, Number(d.id.match(/^U(\d+)$/)?.[1] ?? 0)), 0);
  return `U${String(n + 1).padStart(2, "0")}`;
}

export interface Capture {
  /** The original, written once, relative to the repo root. */
  sourcePath: string;
  ext: string;
  /** Provenance captured at upload. Front matter in a Markdown record wins over it. */
  meta: Record<string, unknown>;
  actor: string;
  /** Contributor uploads wait for the information manager before the AI may read them. */
  reviewRequired: boolean;
  payload?: Record<string, unknown>;
  /** A text rendition made by the caller (e.g. a database row), instead of reading the file. */
  rendition?: { text: string; method: string };
}

const filled = (m: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length)));

/** Any supported file: hash the original, make a text rendition, validate provenance, store once. */
export async function captureFile(c: Capture): Promise<DocumentRow> {
  const bytes = readFileSync(c.sourcePath);
  const twin = allDocuments().find((d) => d.sha256 === sha256(bytes));
  if (twin) throw new Error(`This exact original is already in the register as ${twin.id}.`);
  let meta = filled(c.meta);
  let body = "";
  let method: string;
  let textLayer = true;
  const raw = bytes.toString("utf8");
  if (c.rendition) {
    ({ text: body, method } = c.rendition);
  } else if (c.ext === "md" && /^---\r?\n/.test(raw)) {
    const record = parseRecord(raw);
    // A record's own front matter wins; form or batch provenance only fills what it leaves out.
    meta = { ...meta, ...record.meta };
    body = record.body;
    method = "markdown record";
  } else {
    try {
      ({ text: body, method } = await textOf(bytes, c.ext));
    } catch (e) {
      if (!(e instanceof NeedsOcr)) throw e;
      method = `none (${e.message} Needs OCR.)`;
      textLayer = false;
    }
  }
  meta.id ??= nextDocumentId();
  if (c.reviewRequired) meta.in_ai_scope = false;
  const row = toDocumentRow(meta, body, sha256(bytes), c.sourcePath, { allowEmptyBody: !textLayer });
  return insertDocument(row, c.actor, { text_method: method, text_layer: textLayer, review_required: c.reviewRequired, ...c.payload });
}
