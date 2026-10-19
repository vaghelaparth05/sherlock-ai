import { connection } from "next/server";
import { fail, handle, json } from "@/lib/http";
import { getScan, isId, listScanDocuments, listScanEvents } from "@/lib/repo";

/** Live progress for the scanning screen. Pass ?after=<last event id> to get only new events. */
export async function GET(request: Request, ctx: RouteContext<"/api/scans/[id]">) {
  await connection();
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isId(id)) return fail("Invalid scan id.");
    const scan = await getScan(id);
    if (!scan) return fail("Scan not found.", 404);
    const after = Number(new URL(request.url).searchParams.get("after") ?? 0) || 0;
    const [documents, events] = await Promise.all([listScanDocuments(id), listScanEvents(id, after)]);
    return json({ scan, documents, events });
  });
}
