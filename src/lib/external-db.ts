import { Client } from "pg";
import { addDocument } from "@/lib/repo";
import { query } from "@/lib/db";

/**
 * Read-only import from an existing PostgreSQL database.
 * Each chosen table is exported as one CSV document (first rows only) and stored like any other upload.
 * Only postgres:// URLs are accepted. The session is read-only and has short timeouts.
 * Other engines (MySQL, SQLite, SQL Server) are not supported yet.
 */

const DEMO_URL = () => process.env.DATABASE_URL || "postgres://sherlock:sherlock@localhost:5435/sherlock";
export const ROW_LIMIT = 1000;

export interface ConnInput {
  connectionString?: string;
  demo?: boolean;
}

export interface TableInfo {
  schema: string;
  name: string;
  rows: number;
  columns: string[];
}

export class ConnectionError extends Error {}

function resolveUrl(input: ConnInput): string {
  if (input.demo) return DEMO_URL();
  const cs = (input.connectionString ?? "").trim();
  if (!/^postgres(ql)?:\/\/.+/i.test(cs)) {
    throw new ConnectionError("That does not look like a PostgreSQL connection string. Example: postgres://user:password@host:5432/database");
  }
  return cs;
}

async function withClient<T>(input: ConnInput, fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: resolveUrl(input), connectionTimeoutMillis: 5000, statement_timeout: 10_000 });
  try {
    await client.connect();
  } catch (e) {
    const err = e as Error & { code?: string };
    const why =
      err.code === "ECONNREFUSED" ? "connection refused" : err.code === "ENOTFOUND" ? "host not found" : /password authentication/i.test(err.message) ? "wrong user or password" : err.message;
    throw new ConnectionError(`Could not connect (${why}).`);
  }
  try {
    await client.query("set session characteristics as transaction read only");
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

/** Creates a small demo schema in the app's own database so the connector can be shown without another server. */
export async function ensureDemoSchema(): Promise<void> {
  await query(`
    create schema if not exists naa_demo;
    create table if not exists naa_demo.transfer_requests (
      id serial primary key, agency text, series text, records_from int, records_to int, authority text, status text);
    create table if not exists naa_demo.disposal_log (
      id serial primary key, series text, action text, actioned_on date, retention_applied text, authority text);
  `);
  const t = await query<{ n: number }>("select count(*)::int as n from naa_demo.transfer_requests");
  if (t.rows[0].n === 0) {
    await query(`insert into naa_demo.transfer_requests (agency, series, records_from, records_to, authority, status) values
      ('DRIC','GR-004',2010,2013,'2024/00561247','Pending'),
      ('DRIC','GR-005',2008,2011,'2019/00334118','Pending'),
      ('DRIC','GR-006',2012,2014,'2024/00561247','Transferred')`);
  }
  const d = await query<{ n: number }>("select count(*)::int as n from naa_demo.disposal_log");
  if (d.rows[0].n === 0) {
    await query(`insert into naa_demo.disposal_log (series, action, actioned_on, retention_applied, authority) values
      ('GR-009 Grant application files','Destroyed','2024-06-12','7 years','2024/00561247'),
      ('GR-011 Routine grant correspondence','Destroyed','2024-07-02','3 years','2024/00561247')`);
  }
}

export async function listTables(input: ConnInput): Promise<TableInfo[]> {
  if (input.demo) await ensureDemoSchema();
  return withClient(input, async (c) => {
    const tables = await c.query<{ table_schema: string; table_name: string }>(
      `select table_schema, table_name from information_schema.tables
        where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog','information_schema')
        order by table_schema, table_name`,
    );
    const cols = await c.query<{ table_schema: string; table_name: string; column_name: string }>(
      `select table_schema, table_name, column_name from information_schema.columns
        where table_schema not in ('pg_catalog','information_schema') order by table_schema, table_name, ordinal_position`,
    );
    const est = await c.query<{ schema: string; name: string; n: string }>(
      `select n.nspname as schema, c.relname as name, greatest(c.reltuples, 0)::bigint as n
         from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r'`,
    );
    const rows = new Map(est.rows.map((r) => [`${r.schema}.${r.name}`, Number(r.n)]));
    const out: TableInfo[] = [];
    for (const t of tables.rows) {
      // In demo mode show only the demo schema, not the app's own tables.
      if (input.demo && t.table_schema !== "naa_demo") continue;
      const key = `${t.table_schema}.${t.table_name}`;
      let n = rows.get(key) ?? 0;
      if (n === 0) {
        // reltuples is 0 until the table is analysed; count small tables exactly.
        const exact = await c.query<{ n: string }>(`select count(*) as n from (select 1 from ${ident(t.table_schema)}.${ident(t.table_name)} limit ${ROW_LIMIT + 1}) x`);
        n = Number(exact.rows[0].n);
      }
      out.push({
        schema: t.table_schema,
        name: t.table_name,
        rows: n,
        columns: cols.rows.filter((x) => x.table_schema === t.table_schema && x.table_name === t.table_name).map((x) => x.column_name),
      });
    }
    return out;
  });
}

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function importTables(
  input: ConnInput,
  collectionId: string,
  picks: { schema: string; name: string }[],
): Promise<{ name: string; rows: number; truncated: boolean }[]> {
  const known = await listTables(input);
  const out: { name: string; rows: number; truncated: boolean }[] = [];
  await withClient(input, async (c) => {
    for (const p of picks) {
      // Only tables that were listed can be read, so identifiers never come straight from the request.
      const t = known.find((k) => k.schema === p.schema && k.name === p.name);
      if (!t) throw new ConnectionError(`Unknown table ${p.schema}.${p.name}.`);
      const res = await c.query(`select * from ${ident(t.schema)}.${ident(t.name)} limit ${ROW_LIMIT + 1}`);
      const truncated = res.rows.length > ROW_LIMIT;
      const rows = res.rows.slice(0, ROW_LIMIT);
      const header = res.fields.map((f) => f.name);
      const lines = [
        `# Title: ${t.schema}.${t.name} (database export)`,
        `# Produced by: ${input.demo ? "NAA demo database" : "External database"}`,
        `# Date: ${new Date().toISOString().slice(0, 10)}`,
        "# Status: Current",
        "# Type: Database export",
        ...(truncated ? [`# Note: first ${ROW_LIMIT} rows only`] : []),
        header.join(","),
        ...rows.map((r) => header.map((h) => csvCell((r as Record<string, unknown>)[h])).join(",")),
      ];
      await addDocument(collectionId, `${t.schema}.${t.name}.csv`, Buffer.from(lines.join("\n") + "\n", "utf8"), "You");
      out.push({ name: `${t.schema}.${t.name}`, rows: rows.length, truncated });
    }
  });
  return out;
}
