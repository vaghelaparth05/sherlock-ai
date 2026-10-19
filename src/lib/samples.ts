import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { addDocument, createCollection, findCollectionByName, listDocuments } from "@/lib/repo";

export const NAA_SAMPLE_NAME = "NAA sample: Regional infrastructure grants (synthetic)";

/**
 * Loads the 10 synthetic NAA documents from samples/naa into one collection.
 * Safe to call repeatedly: missing documents are added, existing ones are left alone.
 */
export async function loadNaaSample(): Promise<{ id: string; name: string; added: number; total: number }> {
  const dir = path.join(process.cwd(), "samples", "naa");
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => !f.startsWith(".")).sort();
  } catch {
    throw new Error("The samples/naa folder was not found. Run: npm run build:samples");
  }
  const id = (await findCollectionByName(NAA_SAMPLE_NAME)) ?? (await createCollection(NAA_SAMPLE_NAME, "Ten invented documents about a fictional records authority, with planted issues for testing.")).id;
  const have = new Set((await listDocuments(id)).map((d) => d.name));
  let added = 0;
  for (const f of files) {
    if (have.has(f)) continue;
    await addDocument(id, f, await readFile(path.join(dir, f)), "You");
    added++;
  }
  return { id, name: NAA_SAMPLE_NAME, added, total: files.length };
}
