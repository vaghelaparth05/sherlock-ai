import { ScopeError, addToScope } from "@/lib/register";
import { biasBySubject } from "@/lib/bias";
import { errorResponse, readJson, text } from "@/lib/http";

/** "Add to AI scope": body {documentId, actor, reason}. */
export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const document = addToScope(text(body, "documentId", { max: 40 }), text(body, "actor", { max: 80 }), text(body, "reason", { min: 10 }));
    return Response.json({ document, bias: biasBySubject() });
  } catch (e) {
    return errorResponse(e, [ScopeError]);
  }
}
