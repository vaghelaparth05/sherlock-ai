import { connection } from "next/server";
import { dbHealth } from "@/lib/db";
import { json } from "@/lib/http";
import { scannerConfig } from "@/lib/scanner";

export async function GET() {
  await connection();
  return json({ database: await dbHealth(), scanner: scannerConfig() });
}
