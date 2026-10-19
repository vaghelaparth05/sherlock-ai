import { fail, handle, json } from "@/lib/http";
import { ConnectionError, importTables } from "@/lib/external-db";
import { getCollection, isId } from "@/lib/repo";

/** Exports the chosen tables as CSV documents into a collection. */
export function POST(request: Request) {
  return handle(async () => {
    const body = (await request.json().catch(() => ({}))) as {
      connectionString?: unknown;
      demo?: unknown;
      collectionId?: unknown;
      tables?: { schema?: unknown; name?: unknown }[];
    };
    if (!isId(body.collectionId) || !(await getCollection(body.collectionId))) return fail("Unknown collection.", 404);
    const picks = (body.tables ?? []).filter((t) => typeof t.schema === "string" && typeof t.name === "string") as { schema: string; name: string }[];
    if (!picks.length) return fail("Choose at least one table.");
    try {
      const imported = await importTables(
        { connectionString: typeof body.connectionString === "string" ? body.connectionString : undefined, demo: body.demo === true },
        body.collectionId,
        picks,
      );
      return json({ imported });
    } catch (e) {
      if (e instanceof ConnectionError) return fail(e.message, 400);
      throw e;
    }
  });
}
