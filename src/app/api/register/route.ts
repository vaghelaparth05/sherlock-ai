import { connection } from "next/server";
import { registerRows } from "@/lib/register";

export async function GET() {
  await connection();
  return Response.json({ documents: registerRows() });
}
