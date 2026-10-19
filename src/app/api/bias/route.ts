import { connection } from "next/server";
import { biasBySubject } from "@/lib/bias";

export async function GET() {
  await connection();
  return Response.json({ subjects: biasBySubject() });
}
