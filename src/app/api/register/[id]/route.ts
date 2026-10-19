import { connection } from "next/server";
import { documentDetail } from "@/lib/register";

export async function GET(_request: Request, ctx: RouteContext<"/api/register/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const detail = documentDetail(id);
  if (!detail) return Response.json({ error: "Document not found." }, { status: 404 });
  return Response.json(detail);
}
