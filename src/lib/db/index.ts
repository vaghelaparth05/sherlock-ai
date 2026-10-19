import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { SCHEMA_SQL } from "@/lib/db/schema";

const DEFAULT_URL = "postgres://sherlock:sherlock@localhost:5435/sherlock";

interface Globals {
  __sherlockPool?: Pool;
  __sherlockSchema?: Promise<void>;
}
const g = globalThis as unknown as Globals;

function pool(): Pool {
  if (!g.__sherlockPool) {
    g.__sherlockPool = new Pool({ connectionString: process.env.DATABASE_URL || DEFAULT_URL, max: 10 });
    g.__sherlockPool.on("error", (e) => console.error("[db] idle client error", e.message));
  }
  return g.__sherlockPool;
}

/** Creates tables on first use. Resets so the next call retries if the database was not up yet. */
export function ensureSchema(): Promise<void> {
  if (!g.__sherlockSchema) {
    g.__sherlockSchema = pool()
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((e) => {
        g.__sherlockSchema = undefined;
        throw e;
      });
  }
  return g.__sherlockSchema;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
  await ensureSchema();
  return pool().query<T>(text, params);
}

export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await pool().connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function dbHealth(): Promise<{ ok: boolean; error?: string }> {
  try {
    await query("select 1");
    return { ok: true };
  } catch (e) {
    const err = e as Error & { code?: string };
    return { ok: false, error: err.code === "ECONNREFUSED" ? "Cannot reach Postgres. Is Docker running? Try: docker compose up -d" : err.message };
  }
}
