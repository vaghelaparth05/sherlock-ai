import { connection } from "next/server";
import { fail, handle, json } from "@/lib/http";
import { getTablePage } from "@/lib/data-explorer";

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One page of a table: ?limit=&offset=&q=&sort=&dir=   Add &format=csv to download up to 5,000 matching rows. */
export async function GET(request: Request, ctx: RouteContext<"/api/data/tables/[name]">) {
  await connection();
  return handle(async () => {
    const { name } = await ctx.params;
    const sp = new URL(request.url).searchParams;
    const csv = sp.get("format") === "csv";
    const page = await getTablePage(name, {
      limit: csv ? 5000 : Number(sp.get("limit") ?? 50),
      offset: csv ? 0 : Number(sp.get("offset") ?? 0),
      q: sp.get("q") ?? "",
      sort: sp.get("sort") ?? undefined,
      dir: sp.get("dir") ?? undefined,
    });
    if (!page) return fail("Unknown table.", 404);
    if (!csv) return json(page);

    const header = page.columns.map((c) => c.name);
    const body = [header.join(","), ...page.rows.map((r) => header.map((h) => csvCell(r[h])).join(","))].join("\r\n");
    return new Response("﻿" + body, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sherlock-${page.table}.csv"` },
    });
  });
}
