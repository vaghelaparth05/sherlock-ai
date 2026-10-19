import { connection } from "next/server";
import { registerRows } from "@/lib/register";
import { requireUser } from "@/lib/auth";
import { actorOf } from "@/lib/session";
import { errorResponse } from "@/lib/http";

/**
 * Information manager: records waiting for review, newest first, plus recent decisions.
 * Contributor: their own submissions and where each one stands (no scores or quotes).
 */
export async function GET() {
  await connection();
  try {
    const user = await requireUser();
    const rows = registerRows().filter((r) => r.review !== "not_required" && r.submittedBy);
    rows.sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""));
    if (user.role === "information_manager") {
      return Response.json({ awaiting: rows.filter((r) => r.review === "awaiting"), decided: rows.filter((r) => r.review !== "awaiting") });
    }
    const mine = rows
      .filter((r) => r.submittedBy === actorOf(user))
      .map((r) => ({ id: r.id, title: r.title, submittedAt: r.submittedAt, review: r.review, aiReadable: r.aiReadable }));
    return Response.json({ mine });
  } catch (e) {
    return errorResponse(e);
  }
}
