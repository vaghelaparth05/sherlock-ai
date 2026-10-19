import { verifyIntegrity } from "@/lib/register";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

/** Verify: re-hash every original, rescore (logging TAMPER_DETECTED), and check the ledger chain. */
export async function POST() {
  try {
    await requireUser("information_manager");
    return Response.json(verifyIntegrity());
  } catch (e) {
    return errorResponse(e);
  }
}
