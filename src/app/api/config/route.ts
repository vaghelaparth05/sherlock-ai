import { connection } from "next/server";
import { json } from "@/lib/http";
import { scannerConfig } from "@/lib/scanner";

/** Which scanner will run, without ever exposing the key itself. */
export async function GET() {
  await connection();
  return json(scannerConfig());
}
