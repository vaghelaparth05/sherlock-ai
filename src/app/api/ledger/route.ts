import { connection, type NextRequest } from "next/server";
import { allEntries, verifyChain } from "@/lib/ledger";

/** Ledger entries (filter with ?action= and ?target=) and the result of verifying the chain. */
export async function GET(request: NextRequest) {
  await connection();
  const action = request.nextUrl.searchParams.get("action");
  const target = request.nextUrl.searchParams.get("target");
  const entries = allEntries().filter((e) => (!action || e.action === action) && (!target || e.target_id === target));
  return Response.json({ chain: verifyChain(), entries });
}
