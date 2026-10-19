import { connection } from "next/server";
import { fail, handle, json } from "@/lib/http";
import { getResults, isId } from "@/lib/repo";

export async function GET(_request: Request, ctx: RouteContext<"/api/scans/[id]/results">) {
  await connection();
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isId(id)) return fail("Invalid scan id.");
    const results = await getResults(id);
    return results ? json(results) : fail("Scan not found.", 404);
  });
}
