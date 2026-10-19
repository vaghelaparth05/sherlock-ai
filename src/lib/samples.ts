import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { addDocument, createCollection, findCollectionByName, listDocuments } from "@/lib/repo";

export const SAMPLE_SETS = {
  naa: {
    folder: "naa",
    name: "NAA sample: Regional infrastructure grants (synthetic)",
    description: "Ten invented documents about a fictional records authority, with planted issues for testing.",
  },
  corpus: {
    folder: "corpus",
    name: "Grant program corpus: Riverbend household relief (synthetic)",
    description: "Guidelines, scripts, FAQs, minutes, an AI-generated summary and other records about one grant program, with planted issues for testing.",
  },
} as const;
export type SampleSet = keyof typeof SAMPLE_SETS;
export const NAA_SAMPLE_NAME = SAMPLE_SETS.naa.name;

export const isSampleSet = (s: string): s is SampleSet => Object.hasOwn(SAMPLE_SETS, s);

/**
 * Loads a sample set from the samples folder into its own collection.
 * Safe to call repeatedly: missing documents are added, existing ones are left alone.
 */
export async function loadSample(set: SampleSet): Promise<{ id: string; name: string; added: number; total: number }> {
  const def = SAMPLE_SETS[set];
  const dir = path.join(process.cwd(), "samples", def.folder);
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => !f.startsWith(".")).sort();
  } catch {
    throw new Error(`The samples/${def.folder} folder was not found.`);
  }
  const id = (await findCollectionByName(def.name)) ?? (await createCollection(def.name, def.description)).id;
  const have = new Set((await listDocuments(id)).map((d) => d.name));
  let added = 0;
  for (const f of files) {
    if (have.has(f)) continue;
    await addDocument(id, f, await readFile(path.join(dir, f)), "You");
    added++;
  }
  return { id, name: def.name, added, total: files.length };
}

export const loadNaaSample = () => loadSample("naa");
