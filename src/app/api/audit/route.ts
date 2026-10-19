import { connection } from "next/server";
import { handle, json } from "@/lib/http";
import { isId, listAudit, verifyAudit } from "@/lib/repo";

export async function GET(request: Request) {
  await connection();
  return handle(async () => {
    const sp = new URL(request.url).searchParams;
    const c = sp.get("collection");
    const limit = Math.min(500, Math.max(1, Number(sp.get("limit") ?? 100) || 100));
    const [entries, verification] = await Promise.all([listAudit(limit, isId(c) ? c : null), verifyAudit()]);
    return json({ entries, verification });
  });
}
