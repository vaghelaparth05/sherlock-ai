import { deleteDocument, isValidId } from "@/lib/store";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  if (!isValidId(id)) {
    return Response.json({ error: "Invalid document id." }, { status: 400 });
  }
  const removed = await deleteDocument(id);
  if (!removed) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
