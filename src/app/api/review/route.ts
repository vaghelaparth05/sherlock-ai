import { connection } from "next/server";
import { allRelationships, decisions } from "@/lib/relate";
import { impactOfRelationship } from "@/lib/impact";

/** The review queue: proposed relationships with both quotes and their impact if confirmed. */
export async function GET() {
  await connection();
  const decided = decisions();
  const proposals = allRelationships()
    .filter((r) => !decided.has(r.id))
    .map((r) => impactOfRelationship(r.id));
  return Response.json({ proposals });
}
