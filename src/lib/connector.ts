import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalJson, sha256 } from "./hash.ts";
import { taxonomy } from "./config.ts";
import { RECORD_STATUSES, type Capture } from "./ingest.ts";

/**
 * Read-only SQLite source connector. Each row becomes a record: a canonical JSON snapshot of the
 * row is the original (hashed, kept under data/uploads/records), and its text columns are the rendition.
 */

export class ConnectorError extends Error {}

const DATA = path.join(process.cwd(), "data");
const DEMO = path.join(DATA, "demo-records.db");

// ponytail: SQLite only and only files under data/; Postgres, MySQL and SQL Server need a driver and credentials handling.
function resolve(connectionString: string): string {
  const m = connectionString.trim().match(/^sqlite:(?:\/\/)?(.+)$/i);
  if (!m) {
    throw new ConnectorError("Only SQLite sources are supported in this build, e.g. sqlite://data/demo-records.db. Postgres, MySQL and SQL Server need a database driver.");
  }
  const file = path.resolve(process.cwd(), m[1]);
  if (!file.startsWith(DATA + path.sep) || /sherlock\.db/.test(path.basename(file))) {
    throw new ConnectorError("Point the connector at a SQLite file inside the data folder (not Sherlock's own database).");
  }
  if (file === DEMO && !existsSync(DEMO)) {
    const demo = new DatabaseSync(DEMO);
    demo.exec(readFileSync(path.join(DATA, "demo-records.sql"), "utf8"));
    demo.close();
  }
  if (!existsSync(file)) throw new ConnectorError(`No SQLite file at ${path.relative(process.cwd(), file)}.`);
  return file;
}

function open(connectionString: string) {
  return new DatabaseSync(resolve(connectionString), { readOnly: true });
}

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

export function listTables(connectionString: string) {
  const db = open(connectionString);
  try {
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
    return names.map((name) => ({
      name,
      rows: (db.prepare(`SELECT COUNT(*) AS n FROM ${ident(name)}`).get() as { n: number }).n,
      columns: (db.prepare(`PRAGMA table_info(${ident(name)})`).all() as { name: string }[]).map((c) => c.name),
    }));
  } finally {
    db.close();
  }
}

const COLUMN = {
  title: ["title", "name", "subject", "heading"],
  body: ["body", "text", "content", "notes", "finding", "summary", "description", "message"],
  date: ["date", "effective_date", "meeting_date", "sent_at", "created_at", "issued", "dated"],
  unit: ["owner", "unit", "department", "business_unit"],
  status: ["record_status", "status"],
  function: ["function", "business_function"],
};
const pick = (cols: string[], names: string[]) => cols.find((c) => names.includes(c.toLowerCase()));

/** Captures for every row of the chosen tables. `provenance` fills what the rows do not say. */
export function rowCaptures(connectionString: string, tables: string[], provenance: Record<string, unknown>, actor: string): Capture[] {
  const file = resolve(connectionString);
  const rel = path.relative(process.cwd(), file);
  const known = new Set(listTables(connectionString).map((t) => t.name));
  const db = open(connectionString);
  const tax = taxonomy();
  const captures: Capture[] = [];
  try {
    for (const table of tables) {
      if (!known.has(table)) throw new ConnectorError(`No table ${table} in ${rel}.`);
      const rows = db.prepare(`SELECT rowid AS __rowid, * FROM ${ident(table)}`).all() as Record<string, unknown>[];
      for (const { __rowid, ...row } of rows) {
        const cols = Object.keys(row);
        const get = (k: keyof typeof COLUMN) => {
          const c = pick(cols, COLUMN[k]);
          return c && row[c] !== null ? String(row[c]) : "";
        };
        const body = get("body") || cols.map((c) => `${c}: ${row[c]}`).join("\n");
        const title = get("title") || `${table} #${__rowid}`;
        const snapshot = canonicalJson({ source: "sqlite", database: rel, table, rowid: __rowid, row });
        const hash = sha256(snapshot);
        const sourcePath = path.join("data", "uploads", "records", `${hash}.json`);
        mkdirSync(path.dirname(sourcePath), { recursive: true });
        if (!existsSync(sourcePath)) writeFileSync(sourcePath, snapshot, { flag: "wx" });
        const unit = get("unit");
        const status = get("status");
        captures.push({
          sourcePath,
          ext: "json",
          meta: {
            title,
            unit: tax.units[unit] ? unit : (provenance.unit ?? "unknown"),
            function: get("function") || provenance.function,
            custody: ["business_system"],
            record_status: (RECORD_STATUSES as readonly string[]).includes(status) ? status : (provenance.record_status ?? "final"),
            date: (get("date") || new Date().toISOString()).slice(0, 10),
            in_ai_scope: true,
          },
          actor,
          reviewRequired: false,
          rendition: { text: `${title}\n\n${body}`, method: `sqlite row ${table}#${__rowid}` },
          payload: { submitted_by: actor, original_name: `${rel} › ${table} #${__rowid}`, source: { database: rel, table, rowid: __rowid } },
        });
      }
    }
  } finally {
    db.close();
  }
  return captures;
}
