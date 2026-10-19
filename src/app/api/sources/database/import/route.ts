import { ConnectorError, rowCaptures } from "@/lib/connector";
import { importBatch } from "@/lib/pipeline";
import { getDocument } from "@/lib/ingest";
import { requireUser } from "@/lib/auth";
import { actorOf } from "@/lib/session";
import { BadRequest, errorResponse, readJson, text } from "@/lib/http";

/**
 * Body {connectionString, tables: string[], provenance?: {unit, function, record_status}}.
 * Every row becomes a record, is scored, and counts as approved by the information manager.
 */
export async function POST(request: Request) {
  try {
    const actor = actorOf(await requireUser("information_manager"));
    const body = await readJson(request);
    const tables = Array.isArray(body.tables) ? body.tables.map(String) : [];
    if (!tables.length) throw new BadRequest("Choose at least one table.");
    const captures = rowCaptures(text(body, "connectionString", { max: 500 }), tables, (body.provenance ?? {}) as Record<string, unknown>, actor);
    const result = await importBatch(captures, actor);
    return Response.json({
      ...result,
      documents: result.ingested.map((id) => {
        const d = getDocument(id)!;
        return { id, title: d.title };
      }),
    });
  } catch (e) {
    if (e instanceof ConnectorError) return Response.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
