import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { allDocuments } from "@/lib/ingest";
import { sha256 } from "@/lib/hash";
import { arrive } from "@/lib/pipeline";
import { ACCEPTED_FORMATS, Unsupported } from "@/lib/text";
import { extensionOf, MAX_BYTES } from "@/lib/store";
import { requireUser } from "@/lib/auth";
import { actorOf } from "@/lib/session";

/**
 * A record arrives. Multipart `file` plus provenance fields: title, unit (who created it, or
 * "unknown"), function, custody (how it reached us, origin first, comma-separated), record_status,
 * date, review_date, series, version. A Markdown record's front matter wins over these.
 * A contributor's upload waits for the information manager; hers counts as approved.
 */

const FIELDS = ["title", "unit", "function", "record_status", "date", "review_date", "series", "version", "creator"] as const;

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected a multipart form upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file was provided." }, { status: 400 });
  const ext = extensionOf(file.name);
  if (!ACCEPTED_FORMATS.includes(ext)) {
    return Response.json({ error: `.${ext || "unknown"} is not supported. Use PDF, Word (.docx), HTML, email (.eml), text, Markdown or an image.` }, { status: 415 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) return Response.json({ error: "Files must be between 1 byte and 25 MB." }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = sha256(bytes);
  const twin = allDocuments().find((d) => d.sha256 === hash);
  if (twin) return Response.json({ error: `This exact file is already in the register as ${twin.id}.` }, { status: 409 });

  const field = (k: string) => (typeof form.get(k) === "string" ? (form.get(k) as string).trim() : "");
  const meta: Record<string, unknown> = Object.fromEntries(FIELDS.map((k) => [k, field(k)]));
  const custody = field("custody");
  if (custody) meta.custody = custody.split(/[,>]/).map((c) => c.trim()).filter(Boolean);
  // Defaults for anything the form leaves out. A Markdown record's own front matter still wins.
  meta.title ||= file.name.replace(/\.[^.]+$/, "");
  meta.date ||= new Date().toISOString().slice(0, 10);
  meta.record_status ||= "unknown";
  meta.unit ||= "unknown";
  meta.in_ai_scope = field("in_ai_scope") !== "false";

  const sourcePath = path.join("data", "uploads", "records", `${hash}.${ext}`);
  mkdirSync(path.dirname(sourcePath), { recursive: true });
  if (!existsSync(sourcePath)) writeFileSync(sourcePath, bytes, { flag: "wx" });

  const actor = actorOf(user);
  const isManager = user.role === "information_manager";
  try {
    const result = await arrive(
      { sourcePath, ext, meta, actor, reviewRequired: !isManager, payload: { submitted_by: actor, original_name: file.name } },
      isManager ? { approvedBy: actor } : {},
    );
    return Response.json(result, { status: 201 });
  } catch (e) {
    const status = e instanceof Unsupported || (e instanceof Error && /Provenance|Unknown|must be|Invalid|already ingested|Custody|Dates/.test(e.message)) ? 400 : 502;
    return Response.json({ error: e instanceof Error ? e.message : "Could not ingest this record." }, { status });
  }
}
