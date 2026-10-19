import { query } from "@/lib/db";

/**
 * Read-only access to Sherlock's own tables for the Data explorer page.
 * Table and column names are checked against the database's own catalogue before they are
 * used in SQL, so nothing from the request is ever pasted into a query as an identifier.
 */

const TABLES = [
  "collections",
  "documents",
  "scans",
  "scan_documents",
  "claims",
  "findings",
  "audit_log",
  "scan_events",
  "document_extractions",
] as const;

export interface TableSummary {
  name: string;
  rows: number;
  description: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
}

export interface TablePage {
  table: string;
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  sort: string;
  dir: "asc" | "desc";
}

const DESCRIPTIONS: Record<string, string> = {
  collections: "Groups of documents you import together",
  documents: "Every uploaded file, with its SHA-256 fingerprint",
  scans: "Each scan run, its scanner and its progress",
  scan_documents: "How each document was read in each scan",
  claims: "Claims extracted and traced to their earliest source",
  findings: "Bias, misinformation and disinformation found, and your decisions",
  audit_log: "Tamper-evident record of every upload, scan and decision",
  scan_events: "The live activity log shown on the scanning screen",
  document_extractions: "Saved readings, so unchanged files are not read again",
};

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

async function existing(): Promise<string[]> {
  const r = await query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public'");
  const have = new Set(r.rows.map((x) => x.table_name));
  return TABLES.filter((t) => have.has(t));
}

export async function listTables(): Promise<TableSummary[]> {
  const names = await existing();
  const out: TableSummary[] = [];
  for (const name of names) {
    const c = await query<{ n: string }>(`select count(*) as n from ${ident(name)}`);
    out.push({ name, rows: Number(c.rows[0].n), description: DESCRIPTIONS[name] ?? "" });
  }
  return out;
}

export async function getTablePage(
  table: string,
  opts: { limit?: number; offset?: number; q?: string; sort?: string; dir?: string } = {},
): Promise<TablePage | null> {
  if (!(await existing()).includes(table)) return null;

  const cols = await query<{ column_name: string; data_type: string }>(
    "select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position",
    [table],
  );
  const columns: ColumnInfo[] = cols.rows.map((c) => ({ name: c.column_name, type: c.data_type }));
  const binary = new Set(columns.filter((c) => c.type === "bytea").map((c) => c.name));

  // Binary columns (the stored file bytes) are reported as a size, never sent to the browser.
  const select = columns.map((c) => (binary.has(c.name) ? `octet_length(${ident(c.name)}) as ${ident(c.name)}` : ident(c.name))).join(", ");
  const searchable = columns.filter((c) => !binary.has(c.name)).map((c) => `coalesce(${ident(c.name)}::text, '')`);

  const limit = Math.min(200, Math.max(1, Math.floor(opts.limit ?? 50)));
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  const q = (opts.q ?? "").trim().slice(0, 120);

  const timeCol = ["at", "created_at", "started_at", "uploaded_at"].find((t) => columns.some((c) => c.name === t));
  const sort = columns.some((c) => c.name === opts.sort) ? (opts.sort as string) : (timeCol ?? columns[0].name);
  const dir: "asc" | "desc" = opts.dir === "asc" ? "asc" : opts.dir === "desc" ? "desc" : timeCol && sort === timeCol ? "desc" : "asc";

  const params: unknown[] = [];
  let where = "";
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`);
    where = `where concat_ws(' ', ${searchable.join(", ")}) ilike $1`;
  }

  const total = await query<{ n: string }>(`select count(*) as n from ${ident(table)} ${where}`, params);
  const rows = await query(
    `select ${select} from ${ident(table)} ${where} order by ${ident(sort)} ${dir} nulls last limit ${limit} offset ${offset}`,
    params,
  );
  return { table, columns, rows: rows.rows, total: Number(total.rows[0].n), limit, offset, sort, dir };
}
