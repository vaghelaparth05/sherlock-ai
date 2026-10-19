import { connection } from "next/server";
import { claimDetail } from "@/lib/register";

export async function GET(_request: Request, ctx: RouteContext<"/api/claims/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const detail = claimDetail(id);
  if (!detail) return Response.json({ error: "Claim not found." }, { status: 404 });
  return Response.json(detail);
}
