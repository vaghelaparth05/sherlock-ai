import { GateOverrideError, overrideGate } from "@/lib/register";
import { errorResponse, readJson, text } from "@/lib/http";

export async function POST(request: Request, ctx: RouteContext<"/api/register/[id]/override">) {
  const { id } = await ctx.params;
  try {
    const body = await readJson(request);
    return Response.json(overrideGate(id, text(body, "actor", { max: 80 }), text(body, "reason", { min: 10 })));
  } catch (e) {
    return errorResponse(e, [GateOverrideError]);
  }
}
