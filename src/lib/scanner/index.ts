import { geminiKey, geminiModel, geminiProvider, friendlyGeminiError } from "@/lib/scanner/gemini-provider";
import { externalProvider, scannerUrl } from "@/lib/scanner/external-provider";
import { rulesProvider } from "@/lib/scanner/rules-provider";
import { analyse, type EngineInput } from "@/lib/scanner/engine";
import { applyFrontMatter } from "@/lib/scanner/meta";
import { ExtractedDocSchema, type ScanProvider } from "@/lib/scanner/types";
import {
  completeScan,
  createScan,
  failScan,
  getDocumentsForScan,
  getExtraction,
  saveExtraction,
  runningScanFor,
  scanEvent,
  setScanDocument,
  touchScan,
  type NewFinding,
} from "@/lib/repo";

export type ProviderChoice = "gemini" | "rules" | "external";

export interface ScannerConfig {
  provider: ProviderChoice;
  label: string;
  model: string | null;
  hasKey: boolean;
  forcedRules: boolean;
}

export function scannerConfig(): ScannerConfig {
  const hasKey = !!geminiKey();
  const setting = process.env.SHERLOCK_SCANNER;
  const forcedRules = setting === "rules";
  if (setting === "external" && scannerUrl()) {
    return { provider: "external", label: "External scanner", model: scannerUrl(), hasKey, forcedRules: false };
  }
  const useGemini = hasKey && !forcedRules;
  return {
    provider: useGemini ? "gemini" : "rules",
    label: useGemini ? "Gemini" : "Offline rules scanner",
    model: useGemini ? geminiModel() : null,
    hasKey,
    forcedRules,
  };
}

export function chooseProvider(prefer?: ProviderChoice): ScanProvider {
  const cfg = scannerConfig();
  if (prefer === "rules") return rulesProvider;
  if (cfg.provider === "external") return externalProvider();
  if (cfg.provider === "rules") return rulesProvider;
  return geminiProvider();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ScanConflictError extends Error {
  constructor(public scanId: string) {
    super("A scan of this collection is already running.");
  }
}

/** Creates the scan record and runs it in the background. Returns as soon as the scan exists. */
export async function startScan(
  collectionId: string,
  prefer?: ProviderChoice,
  actor = "You",
  opts: { fresh?: boolean } = {},
): Promise<{ id: string; provider: string }> {
  const running = await runningScanFor(collectionId);
  if (running) throw new ScanConflictError(running);

  const provider = chooseProvider(prefer);
  const { id, docCount } = await createScan(collectionId, provider.id, provider.model, actor);
  if (docCount === 0) {
    await failScan(id, "This collection has no documents to scan.");
    return { id, provider: provider.id };
  }

  // Detached on purpose: the HTTP request returns immediately and the browser polls for progress.
  void runScan(id, collectionId, provider, !!opts.fresh).catch(async (e) => {
    console.error("[scan] failed", e);
    await failScan(id, provider.id === "gemini" ? friendlyGeminiError(e) : (e as Error).message).catch(() => {});
  });
  return { id, provider: provider.id };
}

async function pool<T, R>(items: T[], size: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/**
 * Saved readings are only reused for the same scanner (and, for Gemini, the same model).
 * Bump EXTRACTOR_VERSION when what scanners extract changes, so older saved readings are not reused.
 */
const EXTRACTOR_VERSION = "v2";
const cacheKey = (p: ScanProvider) => `${p.id === "gemini" ? `gemini:${p.model}` : p.id}:${EXTRACTOR_VERSION}`;

async function runScan(scanId: string, collectionId: string, provider: ScanProvider, rereadAll: boolean) {
  const docs = await getDocumentsForScan(collectionId);
  await scanEvent(scanId, `Scanner: ${provider.label}${provider.model ? ` (${provider.model})` : ""}. ${docs.length} documents.`, { stage: "Reading documents", progress: 0.02 });

  /* 1. Read every document */
  const inputs: EngineInput[] = [];
  const errors: string[] = [];
  let done = 0;
  let reused = 0;
  await pool(docs, provider.id === "gemini" ? 3 : 1, async (doc) => {
    await setScanDocument(scanId, doc.id, { status: "reading" });
    try {
      // A file whose content has not changed was already read in an earlier scan: reuse that reading.
      let ex: Awaited<ReturnType<ScanProvider["extract"]>> | null = null;
      let fromCache = false;
      if (!rereadAll) {
        const saved = ExtractedDocSchema.safeParse(await getExtraction(doc.sha256, doc.name, cacheKey(provider)));
        if (saved.success) {
          ex = saved.data;
          fromCache = true;
          reused++;
        }
      }
      if (!ex) {
        await scanEvent(scanId, `Reading ${doc.name}`, { stage: "Reading documents" });
        if (provider.paceMs) await sleep(provider.paceMs);
        ex = await provider.extract(doc);
        await saveExtraction(doc.sha256, doc.name, cacheKey(provider), (({ warnings, ...rest }) => (void warnings, rest))(ex));
      }
      // The record's own front matter (status, version, whether the AI may read it) is read by code and always wins.
      ex = applyFrontMatter(ex, doc.text);
      inputs.push({ doc, ex });
      await setScanDocument(scanId, doc.id, {
        status: "done",
        title: ex.title,
        source: ex.producedBy,
        date: ex.date,
        year: ex.date ? Number(ex.date.slice(0, 4)) : null,
        docType: ex.docType,
        docStatus: ex.status,
        claimCount: ex.claims.length,
        meta: { organisation: ex.organisation, warnings: ex.warnings ?? [], refersTo: ex.refersTo, authorityNumbers: ex.authorityNumbers, reused: fromCache },
        recordStatus: ex.recordStatus,
        series: ex.series,
        version: ex.version,
        inAiScope: ex.inAiScope,
        aiGenerated: ex.aiGenerated === true,
        custody: ex.custody,
        frontId: ex.frontId,
      });
      await scanEvent(
        scanId,
        fromCache
          ? `${doc.name}: already read, reusing ${ex.claims.length} ${ex.claims.length === 1 ? "claim" : "claims"} (unchanged)`
          : `${doc.name}: ${ex.claims.length} ${ex.claims.length === 1 ? "claim" : "claims"} found (${ex.docType})`,
        { progress: 0.02 + 0.58 * (++done / docs.length) },
      );
      for (const w of ex.warnings ?? []) await scanEvent(scanId, `${doc.name}: ${w}`, { level: "warn" });
    } catch (e) {
      const msg = provider.id === "gemini" ? friendlyGeminiError(e) : (e as Error).message;
      errors.push(msg);
      await setScanDocument(scanId, doc.id, { status: "error", error: msg });
      await scanEvent(scanId, `${doc.name}: could not be read. ${msg}`, { level: "warn", progress: 0.02 + 0.58 * (++done / docs.length) });
    }
  });

  if (!inputs.length) throw new Error(errors[0] ?? "No document could be read.");
  if (reused > 0) {
    await scanEvent(scanId, `${reused} ${reused === 1 ? "document was" : "documents were"} already read and unchanged. Checked ${docs.length - reused} new or changed against them.`);
  }
  // Keep results stable: engine output should not depend on which read finished first.
  inputs.sort((a, b) => a.doc.name.localeCompare(b.doc.name));

  /* 2. Compare */
  await scanEvent(scanId, "Tracing each claim back to its earliest source", { stage: "Tracing sources", progress: 0.64 });
  if (provider.paceMs) await sleep(provider.paceMs * 1.2);
  const result = analyse(inputs);

  await scanEvent(scanId, `Comparing ${result.claims.length} claims across documents`, { stage: "Comparing claims", progress: 0.76 });
  if (provider.paceMs) await sleep(provider.paceMs * 1.2);

  await scanEvent(scanId, "Checking registry fingerprints and authority citations", { stage: "Checking integrity", progress: 0.86 });
  if (provider.paceMs) await sleep(provider.paceMs * 1.2);

  /* 3. Second opinion from the AI on each finding the engine raised */
  const titles = Object.fromEntries(result.docs.map((d) => [d.id, d.title]));
  const findings: NewFinding[] = result.candidates.map((c) => ({ ...c, aiReview: null }));
  if (provider.id === "gemini" && findings.length) {
    await scanEvent(scanId, `Asking Gemini to review ${findings.length} findings`, { stage: "Reviewing findings", progress: 0.88 });
    let reviewed = 0;
    await pool(findings, 3, async (f) => {
      const review = await provider.review(f, titles);
      if (review) {
        f.aiReview = review;
        // Integrity and citation findings are checked by hash or register lookup; the model cannot overrule those.
        if (review.verdict === "disagree" && f.kind !== "altered" && f.kind !== "citation") f.confidence = Math.max(20, f.confidence - 25);
      }
      await scanEvent(scanId, `Reviewed: ${f.title}${review ? ` (${review.verdict})` : ""}`, { progress: 0.88 + 0.09 * (++reviewed / findings.length) });
    });
  } else {
    if (provider.paceMs) await sleep(provider.paceMs);
  }

  /* 4. Save */
  await scanEvent(scanId, "Writing results", { stage: "Writing results", progress: 0.98 });
  const claims = result.claims.map((c) => ({ ...c }));

  // Persist per-document facts the engine resolved (so the results screen has dates and types even for odd formats).
  for (const d of result.docs) {
    await setScanDocument(scanId, d.id, {
      status: "done",
      title: d.title,
      source: d.producedBy,
      date: d.date,
      year: d.year,
      docType: d.docType,
      docStatus: d.status,
      recordStatus: d.recordStatus,
      series: d.series,
      version: d.version,
      inAiScope: d.inAiScope,
      aiGenerated: d.aiGenerated,
      custody: d.custody,
      frontId: d.frontId,
    });
  }

  const { carried, fresh } = await completeScan(scanId, claims, findings, provider.id === "gemini" ? "Sherlock (Gemini)" : "Sherlock (rules)");
  await scanEvent(scanId, `Done. ${findings.length} findings (${fresh} new${carried ? `, ${carried} already decided in the previous scan` : ""}).`, { stage: "Complete", progress: 1 });
  await touchScan(scanId, "Complete", 1);
}
