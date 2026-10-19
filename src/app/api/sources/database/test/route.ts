import { fail, handle, json } from "@/lib/http";
import { ConnectionError, listTables } from "@/lib/external-db";

/** Connects (read-only) to a PostgreSQL database and lists its tables. { demo: true } uses the built-in demo schema. */
export function POST(request: Request) {
  return handle(async () => {
    const body = (await request.json().catch(() => ({}))) as { connectionString?: unknown; demo?: unknown };
    try {
      const tables = await listTables({ connectionString: typeof body.connectionString === "string" ? body.connectionString : undefined, demo: body.demo === true });
      return json({ ok: true, tables });
    } catch (e) {
      if (e instanceof ConnectionError) return fail(e.message, 400);
      throw e;
    }
  });
}
