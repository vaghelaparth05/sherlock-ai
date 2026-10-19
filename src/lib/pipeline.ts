import { allDocuments, captureFile, type Capture } from "./ingest.ts";
import { allClaims, extractDocument } from "./extract.ts";
import { relateAll } from "./relate.ts";
import { documentDetail, rescoreAll } from "./register.ts";
import { arrivalImpact } from "./impact.ts";
import { append } from "./ledger.ts";

/**
 * A record arrives: hash and store the original, make a text rendition, extract claims,
 * propose relationships, rescore everything, and report its impact.
 * An information manager's own upload is logged as approved by her; the gate still applies.
 */
export async function arrive(capture: Capture, opts: { approvedBy?: string } = {}) {
  const doc = await captureFile(capture);
  let rejected: Awaited<ReturnType<typeof relateAll>>["rejected"] = [];
  try {
    if (doc.text) {
      await extractDocument(doc.id);
      rejected = (await relateAll(allDocuments(), allClaims())).rejected;
    }
  } finally {
    rescoreAll(); // on failure the document stays quarantined
  }
  if (opts.approvedBy) {
    append({ actor: opts.approvedBy, action: "APPROVE", targetType: "document", targetId: doc.id, payload: { self_upload: true }, reason: "Uploaded by the information manager." });
  }
  return { document: documentDetail(doc.id)!, impact: arrivalImpact(doc.id), rejected };
}

/** A Markdown record on disk with front matter, as the information manager (demo and pre-caching). */
export function arriveRecord(sourcePath: string, actor: string, reviewRequired = false) {
  return arrive({ sourcePath, ext: "md", meta: {}, actor, reviewRequired, payload: { submitted_by: actor } }, reviewRequired ? {} : { approvedBy: actor });
}

/** Many records at once (the Import page): capture all, extract all, relate once, rescore once. */
export async function importBatch(captures: Capture[], approvedBy: string) {
  const ingested: string[] = [];
  const failed: { file: string; error: string }[] = [];
  for (const c of captures) {
    try {
      ingested.push((await captureFile(c)).id);
    } catch (e) {
      failed.push({ file: String(c.payload?.original_name ?? c.sourcePath), error: e instanceof Error ? e.message : String(e) });
    }
  }
  const docs = allDocuments().filter((d) => ingested.includes(d.id) && d.text);
  for (let i = 0; i < docs.length; i += 4) {
    await Promise.all(
      docs.slice(i, i + 4).map((d) =>
        extractDocument(d.id).catch((e) => failed.push({ file: d.id, error: `Extraction failed, left quarantined. ${e instanceof Error ? e.message : e}` })),
      ),
    );
  }
  const { rejected } = await relateAll(allDocuments(), allClaims());
  for (const id of ingested) {
    append({ actor: approvedBy, action: "APPROVE", targetType: "document", targetId: id, payload: { batch: true }, reason: "Imported by the information manager." });
  }
  rescoreAll();
  return { ingested, failed, rejected };
}
