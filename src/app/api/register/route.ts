import { connection } from "next/server";
import { registerRows } from "@/lib/register";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

export async function GET() {
  await connection();
  try {
    await requireUser("information_manager");
    return Response.json({ documents: registerRows() });
  } catch (e) {
    return errorResponse(e);
  }
}
