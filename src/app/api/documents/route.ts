import { connection } from "next/server";
import { fail, handle, json } from "@/lib/http";
import { ALLOWED_EXTENSIONS, MAX_BYTES, addDocument, cleanName, extensionOf, getCollection, isId, listDocuments } from "@/lib/repo";

export async function GET(request: Request) {
  await connection();
  return handle(async () => {
    const collection = new URL(request.url).searchParams.get("collection");
    if (!isId(collection)) return json({ documents: [] });
    return json({ documents: await listDocuments(collection) });
  });
}

export function POST(request: Request) {
  return handle(async () => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fail("Expected a multipart form upload.");
    }

    const file = form.get("file");
    const collectionId = form.get("collection");
    if (!(file instanceof File)) return fail("No file was provided.");
    if (!isId(collectionId) || !(await getCollection(collectionId))) return fail("Unknown collection.", 404);

    const name = cleanName(file.name);
    const ext = extensionOf(name);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return fail(`.${ext || "unknown"} files are not supported. Try PDF, DOCX, TXT, MD, CSV, JSON or HTML.`, 415);
    }
    if (file.size === 0) return fail("This file is empty.");
    if (file.size > MAX_BYTES) return fail("Files must be 25 MB or smaller.", 413);

    return json(await addDocument(collectionId, name, Buffer.from(await file.arrayBuffer())), 201);
  });
}
