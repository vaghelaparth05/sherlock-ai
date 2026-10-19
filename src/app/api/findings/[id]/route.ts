import { FindingError, decideFinding } from "@/lib/findings";
import { DecisionError } from "@/lib/relate";
import { requireUser } from "@/lib/auth";
import { actorOf } from "@/lib/session";
import { BadRequest, errorResponse, readJson, text } from "@/lib/http";

/** Body {status: confirmed | dismissed, note}: the information manager's decision on a finding. */
export async function POST(request: Request, ctx: RouteContext<"/api/findings/[id]">) {
  try {
    const actor = actorOf(await requireUser("information_manager"));
    const body = await readJson(request);
    const status = text(body, "status");
    if (status !== "confirmed" && status !== "dismissed") throw new BadRequest('"status" must be confirmed or dismissed.');
    return Response.json(decideFinding((await ctx.params).id, status, text(body, "note", { min: 3 }), actor));
  } catch (e) {
    return errorResponse(e, [FindingError, DecisionError]);
  }
}
