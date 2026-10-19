import { ScopeError, addToScope } from "@/lib/register";
import { biasBySubject } from "@/lib/bias";
import { requireUser } from "@/lib/auth";
import { actorOf } from "@/lib/session";
import { errorResponse, readJson, text } from "@/lib/http";

/** "Add to AI scope": body {documentId, reason}. */
export async function POST(request: Request) {
  try {
    const actor = actorOf(await requireUser("information_manager"));
    const body = await readJson(request);
    const document = addToScope(text(body, "documentId", { max: 40 }), actor, text(body, "reason", { min: 10 }));
    return Response.json({ document, bias: biasBySubject() });
  } catch (e) {
    return errorResponse(e, [ScopeError]);
  }
}
