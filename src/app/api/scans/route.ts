import { connection } from "next/server";
import { fail, handle, json } from "@/lib/http";
import { getCollection, isId, listScans } from "@/lib/repo";
import { ScanConflictError, startScan, type ProviderChoice } from "@/lib/scanner";

export function POST(request: Request) {
  return handle(async () => {
    const body = (await request.json().catch(() => ({}))) as { collectionId?: unknown; provider?: unknown; fresh?: unknown };
    if (!isId(body.collectionId) || !(await getCollection(body.collectionId))) return fail("Unknown collection.", 404);
    const prefer: ProviderChoice | undefined = body.provider === "rules" || body.provider === "gemini" ? body.provider : undefined;
    try {
      return json(await startScan(body.collectionId, prefer, "You", { fresh: body.fresh === true }), 202);
    } catch (e) {
      if (e instanceof ScanConflictError) return json({ id: e.scanId, alreadyRunning: true }, 200);
      throw e;
    }
  });
}

/** Scan history for one collection: GET /api/scans?collection=<id> */
export async function GET(request: Request) {
  await connection();
  return handle(async () => {
    const c = new URL(request.url).searchParams.get("collection");
    if (!isId(c)) return json({ scans: [] });
    return json({ scans: await listScans(c) });
  });
}
