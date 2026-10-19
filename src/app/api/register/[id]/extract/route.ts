import { allDocuments, getDocument } from "@/lib/ingest";
import { allClaims, extractDocument } from "@/lib/extract";
import { relateAll } from "@/lib/relate";
import { documentDetail, rescoreAll } from "@/lib/register";
import { entriesFor } from "@/lib/ledger";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

/** Retry claim extraction for a quarantined document (e.g. the model was unreachable at upload). */
export async function POST(_request: Request, ctx: RouteContext<"/api/register/[id]/extract">) {
  try {
    await requireUser("information_manager");
    const { id } = await ctx.params;
    const doc = getDocument(id);
    if (!doc) return Response.json({ error: "Document not found." }, { status: 404 });
    if (!doc.text) return Response.json({ error: `${id} has no text layer. It needs OCR first.` }, { status: 409 });
    if (entriesFor(id, "EXTRACT").length) return Response.json({ error: `${id} is already scored.` }, { status: 409 });
    try {
      await extractDocument(id);
      await relateAll(allDocuments(), allClaims());
    } finally {
      rescoreAll();
    }
    return Response.json(documentDetail(id));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Offline mode")) return Response.json({ error: e.message }, { status: 503 });
    return errorResponse(e);
  }
}
