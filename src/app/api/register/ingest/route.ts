import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDocument, parseRecord, toDocumentRow } from "@/lib/ingest";
import { sha256 } from "@/lib/hash";
import { arrive } from "@/lib/pipeline";

/**
 * A record arrives: multipart `file` (Markdown with YAML front matter). Saved once under
 * data/uploads/records, then ingested, extracted, related and scored. Returns its impact.
 */
export async function POST(request: Request) {
  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return Response.json({ error: "Expected a multipart form upload." }, { status: 400 });
  }
  if (!(file instanceof File)) return Response.json({ error: "No file was provided." }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".md")) return Response.json({ error: "Records must be Markdown files with front matter." }, { status: 415 });
  if (file.size === 0 || file.size > 1024 * 1024) return Response.json({ error: "Records must be between 1 byte and 1 MB." }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = sha256(bytes);
  let id: string;
  try {
    const { meta, body } = parseRecord(bytes.toString("utf8"));
    id = toDocumentRow(meta, body, hash, "upload").id;
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Invalid record." }, { status: 400 });
  }
  if (getDocument(id)) return Response.json({ error: `${id} is already in the register.` }, { status: 409 });

  const rel = path.join("data", "uploads", "records", `${id}-${hash.slice(0, 12)}.md`);
  mkdirSync(path.dirname(rel), { recursive: true });
  if (!existsSync(rel)) writeFileSync(rel, bytes, { flag: "wx" });
  try {
    return Response.json(await arrive(rel, "Customer Service team site (upload)"), { status: 201 });
  } catch (e) {
    return Response.json(
      { error: `${id} was ingested but could not be scored, so it stays quarantined. ${e instanceof Error ? e.message : ""}`.trim() },
      { status: 502 },
    );
  }
}
