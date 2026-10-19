import { GateOverrideError, overrideGate } from "@/lib/register";

export async function POST(request: Request, ctx: RouteContext<"/api/register/[id]/override">) {
  const { id } = await ctx.params;
  let body: { actor?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim().slice(0, 80) : "";
  if (!actor) return Response.json({ error: "Say who is overriding the gate." }, { status: 400 });
  if (reason.length < 10) return Response.json({ error: "Write a reason of at least 10 characters." }, { status: 400 });
  try {
    return Response.json(overrideGate(id, actor, reason.slice(0, 1000)));
  } catch (e) {
    if (e instanceof GateOverrideError) return Response.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
