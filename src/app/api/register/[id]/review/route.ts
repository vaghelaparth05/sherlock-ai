import { ReviewError, reviewDocument } from "@/lib/register";
import { requireUser } from "@/lib/auth";
import { actorOf } from "@/lib/session";
import { BadRequest, errorResponse, readJson, text } from "@/lib/http";

/** Body {decision: approve | reject, reason?}. Approving a blocked record needs a reason (an override). */
export async function POST(request: Request, ctx: RouteContext<"/api/register/[id]/review">) {
  try {
    const user = await requireUser("information_manager");
    const body = await readJson(request);
    const decision = text(body, "decision");
    if (decision !== "approve" && decision !== "reject") throw new BadRequest('"decision" must be approve or reject.');
    return Response.json(reviewDocument((await ctx.params).id, decision, actorOf(user), text(body, "reason", { optional: true })));
  } catch (e) {
    return errorResponse(e, [ReviewError]);
  }
}
