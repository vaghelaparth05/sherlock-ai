import { fail, handle, json } from "@/lib/http";
import { deleteDocument, isId } from "@/lib/repo";

export function DELETE(_request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isId(id)) return fail("Invalid document id.");
    return (await deleteDocument(id)) ? json({ ok: true }) : fail("Document not found.", 404);
  });
}
