import { connection } from "next/server";
import { handle, json } from "@/lib/http";
import { isId, latestScanId } from "@/lib/repo";

/** The most recent finished scan (optionally for one collection). Used when a page is opened without ?scan=. */
export async function GET(request: Request) {
  await connection();
  return handle(async () => {
    const c = new URL(request.url).searchParams.get("collection");
    return json({ id: await latestScanId(isId(c) ? c : null, true) });
  });
}
