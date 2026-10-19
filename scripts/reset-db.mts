/**
 * DELETES EVERYTHING in the Sherlock database: collections, documents, scans, findings, saved readings and the audit log.
 * Refuses to run without --yes:   npm run db:reset -- --yes
 */
import pg from "pg";
import { loadEnv } from "./load-env.mts";

loadEnv();
if (!process.argv.includes("--yes")) {
  console.error("This permanently deletes all Sherlock data (documents, scans, findings, audit log).");
  console.error("Run it with --yes if you really mean it:  npm run db:reset -- --yes");
  process.exit(1);
}
const url = process.env.DATABASE_URL || "postgres://sherlock:sherlock@localhost:5435/sherlock";
const pool = new pg.Pool({ connectionString: url });
try {
  const exists = await pool.query("select to_regclass('public.collections') as t");
  if (exists.rows[0].t) {
    await pool.query("truncate collections, audit_log, document_extractions restart identity cascade");
    console.log("Sherlock database emptied.");
  } else {
    console.log("Nothing to reset: tables have not been created yet.");
  }
  await pool.query("drop schema if exists naa_demo cascade");
} catch (e) {
  console.error("Could not reset the database:", (e as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
