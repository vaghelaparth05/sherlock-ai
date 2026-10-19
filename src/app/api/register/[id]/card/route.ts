import { connection } from "next/server";
import { dataCard } from "@/lib/card";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

/** The data card the information manager reviews before approving a record. */
export async function GET(_request: Request, ctx: RouteContext<"/api/register/[id]/card">) {
  await connection();
  try {
    await requireUser("information_manager");
    const card = dataCard((await ctx.params).id);
    if (!card) return Response.json({ error: "Document not found." }, { status: 404 });
    return Response.json(card);
  } catch (e) {
    return errorResponse(e);
  }
}
