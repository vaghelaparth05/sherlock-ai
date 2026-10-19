import { connection } from "next/server";
import { biasBySubject } from "@/lib/bias";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

export async function GET() {
  await connection();
  try {
    await requireUser("information_manager");
    return Response.json({ subjects: biasBySubject() });
  } catch (e) {
    return errorResponse(e);
  }
}
