import { GateOverrideError, overrideGate } from "@/lib/register";
import { requireUser } from "@/lib/auth";
import { actorOf } from "@/lib/session";
import { errorResponse, readJson, text } from "@/lib/http";

/** Body {reason}: allow a blocked document. */
export async function POST(request: Request, ctx: RouteContext<"/api/register/[id]/override">) {
  try {
    const user = await requireUser("information_manager");
    const reason = text(await readJson(request), "reason", { min: 10 });
    return Response.json(overrideGate((await ctx.params).id, actorOf(user), reason));
  } catch (e) {
    return errorResponse(e, [GateOverrideError]);
  }
}
