import { connection } from "next/server";
import { buildDashboard } from "@/lib/dashboard";
import { handle, json } from "@/lib/http";

export async function GET() {
  await connection();
  return handle(async () => {
    return json(await buildDashboard());
  });
}
