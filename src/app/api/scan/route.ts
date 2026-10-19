import { getStaged, listDocuments } from "@/lib/store";
import { allEntries } from "@/lib/ledger";
import { seedDemo } from "@/lib/seed";
import { importBatch } from "@/lib/pipeline";
import { registerRows } from "@/lib/register";
import { biasBySubject } from "@/lib/bias";
import { requireUser } from "@/lib/auth";
import { actorOf } from "@/lib/session";
import { BadRequest, errorResponse, readJson, text } from "@/lib/http";

/**
 * Start scanning (information manager).
 * {mode: "sample"}: reset the register to the Riverbend demo collection (runs from the model cache).
 * {mode: "staged", documentIds?, provenance: {unit, function, custody, record_status}}: ingest files
 * staged on the Import page with that provenance for the batch. Front matter in a record wins.
 */
export async function POST(request: Request) {
  try {
    const actor = actorOf(await requireUser("information_manager"));
    const body = await readJson(request);
    const mode = text(body, "mode");
    if (mode === "sample") {
      const failed = await seedDemo("data/corpus", () => {});
      return Response.json({ failed, documents: registerRows(), bias: biasBySubject() });
    }
    if (mode !== "staged") throw new BadRequest('"mode" must be sample or staged.');

    const p = (body.provenance ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(body.documentIds) ? (body.documentIds as unknown[]).map(String) : (await listDocuments()).map((d) => d.id);
    const done = new Set(allEntries().filter((e) => e.action === "INGEST").map((e) => JSON.parse(e.payload_json).staged_id));
    const captures = [];
    for (const id of ids.filter((i) => !done.has(i))) {
      const staged = await getStaged(id);
      if (!staged) continue;
      captures.push({
        sourcePath: staged.path,
        ext: staged.ext,
        meta: {
          title: staged.name.replace(/\.[^.]+$/, ""),
          unit: typeof p.unit === "string" ? p.unit : "unknown",
          function: p.function,
          custody: typeof p.custody === "string" ? p.custody.split(/[,>]/).map((c) => c.trim()) : p.custody,
          record_status: typeof p.record_status === "string" ? p.record_status : "unknown",
          date: typeof p.date === "string" ? p.date : staged.uploadedAt.slice(0, 10),
          in_ai_scope: true,
        },
        actor,
        reviewRequired: false,
        payload: { staged_id: id, original_name: staged.name, collection: staged.collection, submitted_by: actor },
      });
    }
    if (!captures.length) throw new BadRequest("Nothing new to scan: every staged file is already in the register.");
    const result = await importBatch(captures, actor);
    return Response.json({ ...result, documents: registerRows() });
  } catch (e) {
    return errorResponse(e);
  }
}
