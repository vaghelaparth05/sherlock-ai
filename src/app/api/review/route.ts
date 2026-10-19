import { connection } from "next/server";
import { allRelationships, decisions } from "@/lib/relate";
import { impactOfRelationship } from "@/lib/impact";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

/** The review queue: proposed relationships with both quotes and their impact if confirmed. */
export async function GET() {
  await connection();
  try {
    await requireUser("information_manager");
    const decided = decisions();
    return Response.json({ proposals: allRelationships().filter((r) => !decided.has(r.id)).map((r) => impactOfRelationship(r.id)) });
  } catch (e) {
    return errorResponse(e);
  }
}
