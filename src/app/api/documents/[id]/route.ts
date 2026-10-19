import { deleteDocument, isValidId } from "@/lib/store";
import { allEntries } from "@/lib/ledger";
import { requireUser } from "@/lib/auth";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  try {
    await requireUser("information_manager");
  } catch (e) {
    return e as Response;
  }
  const { id } = await ctx.params;
  if (!isValidId(id)) {
    return Response.json({ error: "Invalid document id." }, { status: 400 });
  }
  const ingested = allEntries().find((e) => e.action === "INGEST" && JSON.parse(e.payload_json).staged_id === id);
  if (ingested) {
    return Response.json({ error: `This file is in the register as ${ingested.target_id}. Originals are never deleted.` }, { status: 409 });
  }
  const removed = await deleteDocument(id);
  if (!removed) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
