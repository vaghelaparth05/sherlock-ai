import { connection } from "next/server";
import { documentDetail } from "@/lib/register";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

export async function GET(_request: Request, ctx: RouteContext<"/api/register/[id]">) {
  await connection();
  try {
    await requireUser("information_manager");
    const detail = documentDetail((await ctx.params).id);
    if (!detail) return Response.json({ error: "Document not found." }, { status: 404 });
    return Response.json(detail);
  } catch (e) {
    return errorResponse(e);
  }
}
