import { DecisionError, RELATIONSHIP_TYPES, decide, type RelationshipType } from "@/lib/relate";
import { impactOfRelationship, issueRecalls } from "@/lib/impact";
import { rescoreAll } from "@/lib/register";
import { BadRequest, errorResponse, readJson, text } from "@/lib/http";

/** Confirm, dismiss or change a proposed relationship. Confirming issues recall notices. */
export async function POST(request: Request, ctx: RouteContext<"/api/review/[id]">) {
  const { id } = await ctx.params;
  try {
    const body = await readJson(request);
    const decision = text(body, "decision");
    if (decision !== "confirm" && decision !== "dismiss" && decision !== "change") {
      throw new BadRequest('"decision" must be confirm, dismiss or change.');
    }
    const type = text(body, "type", { optional: true }) as RelationshipType;
    if (type && !RELATIONSHIP_TYPES.includes(type)) throw new BadRequest(`"type" must be one of ${RELATIONSHIP_TYPES.join(", ")}.`);
    const actor = text(body, "actor", { max: 80 });
    decide(id, decision, actor, text(body, "reason", { optional: true }) || undefined, type || undefined);
    rescoreAll();
    const recalls = decision === "dismiss" ? [] : issueRecalls(id, actor);
    return Response.json({ impact: impactOfRelationship(id), recallsIssued: recalls.length });
  } catch (e) {
    return errorResponse(e, [DecisionError]);
  }
}
