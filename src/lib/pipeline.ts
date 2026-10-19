import { allDocuments, ingestFile } from "./ingest.ts";
import { allClaims, extractDocument } from "./extract.ts";
import { relateAll } from "./relate.ts";
import { documentDetail, rescoreAll } from "./register.ts";
import { arrivalImpact } from "./impact.ts";

/** A new document arrives: ingest, extract, propose relationships, rescore, show its impact. */
export async function arrive(sourcePath: string, actor: string) {
  const doc = ingestFile(sourcePath, actor);
  try {
    await extractDocument(doc.id);
    const related = await relateAll(allDocuments(), allClaims());
    rescoreAll();
    return { document: documentDetail(doc.id)!, impact: arrivalImpact(doc.id), rejected: related.rejected };
  } catch (e) {
    rescoreAll(); // the document stays quarantined
    throw e;
  }
}
