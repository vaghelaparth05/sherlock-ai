import { connection, type NextRequest } from "next/server";
import { allEntries, verifyChain } from "@/lib/ledger";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

/** Ledger entries (filter with ?action= and ?target=) and the result of verifying the hash chain. */
export async function GET(request: NextRequest) {
  await connection();
  try {
    await requireUser("information_manager");
    const action = request.nextUrl.searchParams.get("action");
    const target = request.nextUrl.searchParams.get("target");
    const entries = allEntries().filter((e) => (!action || e.action === action) && (!target || e.target_id === target));
    return Response.json({ chain: verifyChain(), entries });
  } catch (e) {
    return errorResponse(e);
  }
}
