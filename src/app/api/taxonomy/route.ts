import { connection } from "next/server";
import { scoringConfig, taxonomy } from "@/lib/config";
import { RECORD_STATUSES } from "@/lib/ingest";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

/** Choices for provenance forms: units, business functions, custody points and record statuses. */
export async function GET() {
  await connection();
  try {
    await requireUser();
    const tax = taxonomy();
    return Response.json({
      units: Object.keys(tax.units),
      functions: Object.keys(tax.functions),
      custody: Object.keys(scoringConfig().custody),
      statuses: RECORD_STATUSES.filter((s) => s !== "ai_generated"),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
