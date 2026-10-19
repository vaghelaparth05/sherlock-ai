import { ConnectorError, listTables } from "@/lib/connector";
import { requireUser } from "@/lib/auth";
import { errorResponse, readJson, text } from "@/lib/http";

/** Body {connectionString}: open the source read-only and list its tables. */
export async function POST(request: Request) {
  try {
    await requireUser("information_manager");
    const tables = listTables(text(await readJson(request), "connectionString", { max: 500 }));
    return Response.json({ ok: true, mocked: false, tables });
  } catch (e) {
    if (e instanceof ConnectorError) return Response.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
