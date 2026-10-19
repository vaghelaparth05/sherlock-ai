import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

/**
 * Local document store for the import page.
 * Originals are written once and never modified. Their SHA-256 is recorded at
 * upload time so later steps can prove a file is unchanged.
 * Swap this module for object storage + a database when the real backend lands.
 */

const ROOT = path.join(process.cwd(), "data", "uploads");

/** Formats Sherlock can read text from (see text.ts), plus images that are held for OCR. */
export const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt", "md", "csv", "json", "html", "htm", "eml", "png", "jpg", "jpeg", "tif", "tiff", "heic"]);
export const MAX_BYTES = 25 * 1024 * 1024;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface StoredDocument {
  id: string;
  name: string;
  size: number;
  ext: string;
  hash: string;
  collection: string;
  uploadedAt: string;
}

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export function cleanName(raw: string): string {
  const base = path.basename(raw.replace(/\\/g, "/"));
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim();
  return cleaned.slice(0, 180) || "untitled";
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

async function ensureRoot() {
  await fs.mkdir(ROOT, { recursive: true });
}

export async function saveDocument(file: File, collection: string): Promise<StoredDocument> {
  await ensureRoot();
  const id = randomUUID();
  const name = cleanName(file.name);
  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  const doc: StoredDocument = {
    id,
    name,
    size: bytes.byteLength,
    ext: extensionOf(name),
    hash,
    collection: collection.trim().slice(0, 80) || "Untitled collection",
    uploadedAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(ROOT, `${id}.bin`), bytes, { flag: "wx" });
  await fs.writeFile(path.join(ROOT, `${id}.json`), JSON.stringify(doc, null, 2), { flag: "wx" });
  return doc;
}

export async function listDocuments(): Promise<StoredDocument[]> {
  await ensureRoot();
  const entries = await fs.readdir(ROOT);
  const docs: StoredDocument[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      docs.push(JSON.parse(await fs.readFile(path.join(ROOT, entry), "utf8")) as StoredDocument);
    } catch {
      // skip unreadable metadata
    }
  }
  return docs.sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
}

/** A staged original and its metadata, or undefined. */
export async function getStaged(id: string): Promise<(StoredDocument & { path: string }) | undefined> {
  if (!isValidId(id)) return undefined;
  try {
    const doc = JSON.parse(await fs.readFile(path.join(ROOT, `${id}.json`), "utf8")) as StoredDocument;
    return { ...doc, path: path.join("data", "uploads", `${id}.bin`) };
  } catch {
    return undefined;
  }
}

export async function deleteDocument(id: string): Promise<boolean> {
  if (!isValidId(id)) return false;
  let found = false;
  for (const suffix of [".bin", ".json"]) {
    try {
      await fs.unlink(path.join(ROOT, `${id}${suffix}`));
      found = true;
    } catch {
      // already gone
    }
  }
  return found;
}
