import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  ALLOWED_EXTENSIONS,
  MAX_BYTES,
  cleanName,
  extensionOf,
  listDocuments,
  saveDocument,
} from "@/lib/store";

export async function GET() {
  await connection();
  try {
    await requireUser("information_manager");
  } catch (e) {
    return e as Response;
  }
  return Response.json({ documents: await listDocuments() });
}

export async function POST(request: Request) {
  try {
    await requireUser("information_manager");
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
  if (!(file instanceof File)) {
    return Response.json({ error: "No file was provided." }, { status: 400 });
  }

  const name = cleanName(file.name);
  const ext = extensionOf(name);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return Response.json(
      { error: `.${ext || "unknown"} files are not supported. Use PDF, Word (.docx), HTML, email (.eml), text, Markdown or an image.` },
      { status: 415 },
    );
  }
  if (file.size === 0) {
    return Response.json({ error: "This file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Files must be 25 MB or smaller." }, { status: 413 });
  }

  const collection = typeof form.get("collection") === "string" ? (form.get("collection") as string) : "";
  const doc = await saveDocument(file, collection);
  return Response.json(doc, { status: 201 });
}
