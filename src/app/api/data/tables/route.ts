import { connection } from "next/server";
import { handle, json } from "@/lib/http";
import { listTables } from "@/lib/data-explorer";

/** The tables the Data explorer can show, with row counts. */
export async function GET() {
  await connection();
  return handle(async () => json({ tables: await listTables() }));
}
