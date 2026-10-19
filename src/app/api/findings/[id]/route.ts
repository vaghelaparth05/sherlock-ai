import { fail, handle, json } from "@/lib/http";
import { decideFinding, isId } from "@/lib/repo";
import type { FindingStatus } from "@/lib/types";

const STATUSES: FindingStatus[] = ["open", "confirmed", "dismissed"];

export function PATCH(request: Request, ctx: RouteContext<"/api/findings/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isId(id)) return fail("Invalid finding id.");
    const body = (await request.json().catch(() => ({}))) as { status?: FindingStatus; note?: unknown; actor?: unknown };
    if (!body.status || !STATUSES.includes(body.status)) return fail("status must be open, confirmed or dismissed.");
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 600) : null;
    const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim().slice(0, 80) : "Reviewer";
    const updated = await decideFinding(id, body.status, note, actor);
    return updated ? json(updated) : fail("Finding not found.", 404);
  });
}
