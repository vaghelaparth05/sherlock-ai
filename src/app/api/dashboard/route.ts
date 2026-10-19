import { connection } from "next/server";
import { dashboard } from "@/lib/findings";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

/** Dashboard numbers in the shapes of src/lib/mock-dashboard.ts. */
export async function GET() {
  await connection();
  try {
    await requireUser("information_manager");
    return Response.json(dashboard());
  } catch (e) {
    return errorResponse(e);
  }
}
