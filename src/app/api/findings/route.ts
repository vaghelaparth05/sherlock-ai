import { connection } from "next/server";
import { results } from "@/lib/findings";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

/** {collection, docs, claims, findings} in the shapes of src/lib/results-data.ts. */
export async function GET() {
  await connection();
  try {
    await requireUser("information_manager");
    return Response.json(results());
  } catch (e) {
    return errorResponse(e);
  }
}
