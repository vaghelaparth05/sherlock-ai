import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query, tx } from "@/lib/db";
import { extractText } from "@/lib/text";
import type {
  AiReview,
  AuditEntry,
  AuditVerification,
  Claim,
  ClaimStatus,
  CollectionInfo,
  Evidence,
  Finding,
  FindingKind,
  FindingStatus,
  FindingType,
  ImportedDocument,
  ResultsPayload,
  ScanDocState,
  ScanEvent,
  ScanInfo,
  ScanStatus,
  ScanSummary,
  Severity,
  SourceDoc,
} from "@/lib/types";

export const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt", "md", "csv", "json", "html", "htm", "rtf", "eml"]);
export const MAX_BYTES = 25 * 1024 * 1024;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isId = (s: unknown): s is string => typeof s === "string" && ID.test(s);

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export function cleanName(raw: string): string {
  const base = raw.replace(/\\/g, "/").split("/").pop() ?? raw;
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim();
  return cleaned.slice(0, 180) || "untitled";
}
export const extensionOf = (name: string) => (name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "");

/* ------------------------------------------------------------------ audit log */

type Db = Pick<PoolClient, "query">;

interface AuditInput {
  actor: string;
  action: string;
  detail: string;
  collectionId?: string | null;
  scanId?: string | null;
  findingId?: string | null;
}

const auditHash = (prev: string, at: string, a: AuditInput) =>
  createHash("sha256")
    .update([prev, at, a.actor, a.action, a.detail, a.collectionId ?? "", a.scanId ?? "", a.findingId ?? ""].join("|"))
    .digest("hex");

/** Appends to the hash-chained log. Each entry includes the previous entry's hash. */
export async function appendAudit(db: Db | null, a: AuditInput): Promise<void> {
  const run = async (c: Db) => {
    await c.query("select pg_advisory_xact_lock(7419)");
    const last = await c.query<{ hash: string }>("select hash from audit_log order by id desc limit 1");
    const prev = last.rows[0]?.hash ?? "0".repeat(64);
    const at = new Date().toISOString();
    await c.query(
      `insert into audit_log (at, collection_id, scan_id, finding_id, actor, action, detail, prev_hash, hash)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [at, a.collectionId ?? null, a.scanId ?? null, a.findingId ?? null, a.actor, a.action, a.detail, prev, auditHash(prev, at, a)],
    );
  };
  if (db) await run(db);
  else await tx(run);
}

export async function listAudit(limit = 200, collectionId?: string | null): Promise<AuditEntry[]> {
  const r = await query(
    `select id, at, actor, action, detail, hash, prev_hash from audit_log
     ${collectionId ? "where collection_id = $2" : ""} order by id desc limit $1`,
    collectionId ? [limit, collectionId] : [limit],
  );
  return r.rows.map((x) => ({ id: Number(x.id), at: iso(x.at)!, actor: x.actor, action: x.action, detail: x.detail, hash: x.hash, prevHash: x.prev_hash }));
}

export async function verifyAudit(): Promise<AuditVerification> {
  const r = await query("select id, at, collection_id, scan_id, finding_id, actor, action, detail, prev_hash, hash from audit_log order by id asc");
  let prev = "0".repeat(64);
  for (const row of r.rows) {
    const expected = auditHash(prev, iso(row.at)!, {
      actor: row.actor,
      action: row.action,
      detail: row.detail,
      collectionId: row.collection_id,
      scanId: row.scan_id,
      findingId: row.finding_id,
    });
    if (row.prev_hash !== prev || row.hash !== expected) return { ok: false, entries: r.rows.length, brokenAt: Number(row.id) };
    prev = row.hash;
  }
  return { ok: true, entries: r.rows.length, brokenAt: null };
}

/* ------------------------------------------------------------------ collections & documents */

export async function createCollection(name: string, description?: string | null): Promise<{ id: string; name: string }> {
  const clean = name.trim().slice(0, 120) || "Untitled collection";
  const r = await query<{ id: string }>("insert into collections (name, description) values ($1,$2) returning id", [clean, description ?? null]);
  return { id: r.rows[0].id, name: clean };
}

export async function findCollectionByName(name: string): Promise<string | null> {
  const r = await query<{ id: string }>("select id from collections where name = $1 order by created_at limit 1", [name]);
  return r.rows[0]?.id ?? null;
}

export async function listCollections(): Promise<CollectionInfo[]> {
  const r = await query(
    `select c.id, c.name, c.description, c.created_at,
            (select count(*)::int from documents d where d.collection_id = c.id) as document_count,
            (select s.id from scans s where s.collection_id = c.id order by s.started_at desc limit 1) as latest_scan
       from collections c order by c.created_at desc`,
  );
  return r.rows.map((x) => ({
    id: x.id,
    name: x.name,
    description: x.description,
    createdAt: iso(x.created_at)!,
    documentCount: x.document_count,
    latestScanId: x.latest_scan,
  }));
}

export async function getCollection(id: string): Promise<{ id: string; name: string } | null> {
  const r = await query<{ id: string; name: string }>("select id, name from collections where id = $1", [id]);
  return r.rows[0] ?? null;
}

export async function addDocument(collectionId: string, name: string, bytes: Buffer, actor = "You"): Promise<ImportedDocument> {
  const clean = cleanName(name);
  const ext = extensionOf(clean);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const text = await extractText(bytes, ext);
  return tx(async (c) => {
    const r = await c.query(
      `insert into documents (collection_id, name, ext, size, sha256, content, text_content)
       values ($1,$2,$3,$4,$5,$6,$7) returning id, uploaded_at`,
      [collectionId, clean, ext, bytes.byteLength, sha256, bytes, text],
    );
    await appendAudit(c, { actor, action: "document.added", detail: `Added ${clean} (SHA-256 ${sha256.slice(0, 12)}…)`, collectionId });
    return { id: r.rows[0].id, collectionId, name: clean, ext, size: bytes.byteLength, sha256, uploadedAt: iso(r.rows[0].uploaded_at)! };
  });
}

export async function listDocuments(collectionId: string): Promise<ImportedDocument[]> {
  const r = await query(
    "select id, collection_id, name, ext, size, sha256, uploaded_at from documents where collection_id = $1 order by name",
    [collectionId],
  );
  return r.rows.map((x) => ({ id: x.id, collectionId: x.collection_id, name: x.name, ext: x.ext, size: x.size, sha256: x.sha256, uploadedAt: iso(x.uploaded_at)! }));
}

export async function deleteDocument(id: string, actor = "You"): Promise<boolean> {
  return tx(async (c) => {
    const r = await c.query<{ name: string; collection_id: string }>("delete from documents where id = $1 returning name, collection_id", [id]);
    if (!r.rows[0]) return false;
    await appendAudit(c, { actor, action: "document.removed", detail: `Removed ${r.rows[0].name}`, collectionId: r.rows[0].collection_id });
    return true;
  });
}

export async function getDocumentsForScan(collectionId: string) {
  const r = await query("select id, name, ext, sha256, text_content, content from documents where collection_id = $1 order by name", [collectionId]);
  return r.rows.map((x) => ({ id: x.id as string, name: x.name as string, ext: x.ext as string, sha256: x.sha256 as string, text: x.text_content as string | null, bytes: x.content as Buffer }));
}

/* ------------------------------------------------------------------ scans */

const rowToScan = (x: Record<string, unknown>): ScanInfo => ({
  id: x.id as string,
  collectionId: x.collection_id as string,
  collectionName: x.collection_name as string,
  status: x.status as ScanStatus,
  provider: x.provider as string,
  model: (x.model as string) ?? null,
  stage: x.stage as string,
  progress: Number(x.progress),
  startedAt: iso(x.started_at as Date)!,
  finishedAt: iso(x.finished_at as Date | null),
  error: (x.error as string) ?? null,
  docCount: x.doc_count as number,
  claimCount: x.claim_count as number,
  findingCount: x.finding_count as number,
});

const SCAN_SELECT = `select s.*, c.name as collection_name from scans s join collections c on c.id = s.collection_id`;
const STALE_MS = 3 * 60 * 1000;

export async function getScan(id: string): Promise<ScanInfo | null> {
  const r = await query(`${SCAN_SELECT} where s.id = $1`, [id]);
  const row = r.rows[0];
  if (!row) return null;
  // A scan that stopped updating (for example the server restarted) must not look "running" forever.
  if (row.status === "running" && Date.now() - new Date(row.updated_at).getTime() > STALE_MS) {
    await query("update scans set status = 'failed', error = $2, finished_at = now(), updated_at = now() where id = $1", [
      id,
      "The scan was interrupted, probably because the server restarted. Start it again.",
    ]);
    return getScan(id);
  }
  return rowToScan(row);
}

export async function latestScanId(collectionId?: string | null, completeOnly = false): Promise<string | null> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (collectionId) {
    params.push(collectionId);
    where.push(`collection_id = $${params.length}`);
  }
  if (completeOnly) where.push("status = 'complete'");
  const r = await query<{ id: string }>(`select id from scans ${where.length ? "where " + where.join(" and ") : ""} order by started_at desc limit 1`, params);
  return r.rows[0]?.id ?? null;
}

export async function runningScanFor(collectionId: string): Promise<string | null> {
  const r = await query<{ id: string }>(
    "select id from scans where collection_id = $1 and status in ('queued','running') and updated_at > now() - interval '3 minutes' limit 1",
    [collectionId],
  );
  return r.rows[0]?.id ?? null;
}

export async function createScan(collectionId: string, provider: string, model: string | null, actor: string): Promise<{ id: string; docCount: number }> {
  return tx(async (c) => {
    const prev = await c.query<{ id: string }>("select id from scans where collection_id = $1 and status = 'complete' order by started_at desc limit 1", [collectionId]);
    const docs = await c.query<{ id: string; name: string }>("select id, name from documents where collection_id = $1 order by name", [collectionId]);
    const r = await c.query<{ id: string }>(
      `insert into scans (collection_id, status, provider, model, stage, doc_count, previous_scan_id)
       values ($1,'running',$2,$3,'Starting',$4,$5) returning id`,
      [collectionId, provider, model, docs.rows.length, prev.rows[0]?.id ?? null],
    );
    const scanId = r.rows[0].id;
    for (const d of docs.rows) await c.query("insert into scan_documents (scan_id, document_id, status, title) values ($1,$2,'queued',$3)", [scanId, d.id, d.name]);
    await appendAudit(c, { actor, action: "scan.started", detail: `Started a scan of ${docs.rows.length} documents with ${provider}${model ? ` (${model})` : ""}`, collectionId, scanId });
    return { id: scanId, docCount: docs.rows.length };
  });
}

export async function scanEvent(scanId: string, message: string, opts: { level?: "info" | "warn" | "error"; stage?: string; progress?: number } = {}) {
  await query("insert into scan_events (scan_id, level, message) values ($1,$2,$3)", [scanId, opts.level ?? "info", message]);
  await touchScan(scanId, opts.stage, opts.progress);
}

export async function touchScan(scanId: string, stage?: string, progress?: number) {
  await query(
    `update scans set updated_at = now(),
       stage = coalesce($2, stage),
       progress = case when $3::real is null then progress else greatest(progress, $3::real) end
     where id = $1`,
    [scanId, stage ?? null, progress ?? null],
  );
}

export async function listScanEvents(scanId: string, after = 0): Promise<ScanEvent[]> {
  const r = await query("select id, at, level, message from scan_events where scan_id = $1 and id > $2 order by id asc limit 500", [scanId, after]);
  return r.rows.map((x) => ({ id: Number(x.id), at: iso(x.at)!, level: x.level, message: x.message }));
}

export async function listScanDocuments(scanId: string): Promise<ScanDocState[]> {
  const r = await query(
    `select d.id, d.name, sd.status, sd.title, sd.source, sd.claim_count, sd.error, (sd.meta->>'reused') = 'true' as reused
       from scan_documents sd join documents d on d.id = sd.document_id where sd.scan_id = $1 order by d.name`,
    [scanId],
  );
  return r.rows.map((x) => ({
    id: x.id,
    name: x.name,
    status: x.status,
    title: x.status === "done" ? x.title : null,
    source: x.source,
    claims: x.claim_count,
    error: x.error,
    reused: x.reused === true,
  }));
}

export async function setScanDocument(
  scanId: string,
  documentId: string,
  patch: {
    status: "reading" | "done" | "error";
    title?: string;
    source?: string;
    date?: string | null;
    year?: number | null;
    docType?: string;
    docStatus?: string;
    claimCount?: number;
    error?: string;
    meta?: unknown;
    recordStatus?: string | null;
    series?: string | null;
    version?: number | null;
    inAiScope?: boolean | null;
    aiGenerated?: boolean;
    custody?: string[];
    frontId?: string | null;
  },
) {
  await query(
    `update scan_documents set status = $3,
       title = coalesce($4, title), source = coalesce($5, source), doc_date = coalesce($6::date, doc_date), year = coalesce($7, year),
       doc_type = coalesce($8, doc_type), doc_status = coalesce($9, doc_status), claim_count = coalesce($10, claim_count),
       error = $11, meta = coalesce($12::jsonb, meta),
       record_status = coalesce($13, record_status), series = coalesce($14, series), version = coalesce($15, version),
       in_ai_scope = coalesce($16, in_ai_scope), ai_generated = coalesce($17, ai_generated),
       custody = coalesce($18::text[], custody), front_id = coalesce($19, front_id)
     where scan_id = $1 and document_id = $2`,
    [
      scanId, documentId, patch.status, patch.title ?? null, patch.source ?? null, patch.date ?? null, patch.year ?? null,
      patch.docType ?? null, patch.docStatus ?? null, patch.claimCount ?? null, patch.error ?? null, patch.meta ? JSON.stringify(patch.meta) : null,
      patch.recordStatus ?? null, patch.series ?? null, patch.version ?? null, patch.inAiScope ?? null, patch.aiGenerated ?? null,
      patch.custody ?? null, patch.frontId ?? null,
    ],
  );
}

export interface NewClaim {
  key: string;
  text: string;
  attribute: string;
  subject: string;
  value: string;
  originDocId: string;
  citedByDocIds: string[];
  status: ClaimStatus;
}
export interface NewFinding {
  type: FindingType;
  kind: FindingKind;
  title: string;
  summary: string;
  severity: Severity;
  confidence: number;
  evidence: Evidence[];
  docIds: string[];
  claimKeys: string[];
  fingerprint: string;
  aiReview: AiReview | null;
}

/** Writes the scan's claims and findings, carrying decisions over from the previous scan of the same collection. */
export async function completeScan(scanId: string, claims: NewClaim[], findings: NewFinding[], actor = "Sherlock"): Promise<{ carried: number; fresh: number }> {
  return tx(async (c) => {
    const scan = (await c.query<{ collection_id: string; previous_scan_id: string | null }>("select collection_id, previous_scan_id from scans where id = $1", [scanId])).rows[0];
    const prior = new Map<string, { status: string; note: string | null; decided_at: Date | null }>();
    if (scan.previous_scan_id) {
      const p = await c.query("select fingerprint, status, note, decided_at from findings where scan_id = $1", [scan.previous_scan_id]);
      for (const x of p.rows) prior.set(x.fingerprint, x);
    }

    const keyToId = new Map<string, string>();
    for (const cl of claims) {
      const id = randomUUID();
      keyToId.set(cl.key, id);
      await c.query(
        `insert into claims (id, scan_id, text, attribute, subject, value, origin_doc, status, cited_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, scanId, cl.text, cl.attribute, cl.subject, cl.value, cl.originDocId, cl.status, cl.citedByDocIds],
      );
    }

    let carried = 0;
    for (const f of findings) {
      const before = prior.get(f.fingerprint);
      if (before && before.status !== "open") carried++;
      await c.query(
        `insert into findings (scan_id, type, kind, title, summary, severity, confidence, status, fingerprint, is_new, note, decided_at, evidence, doc_ids, claim_ids, ai_review)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          scanId, f.type, f.kind, f.title, f.summary, f.severity, f.confidence,
          before?.status ?? "open", f.fingerprint, !before, before?.note ?? null, before?.decided_at ?? null,
          JSON.stringify(f.evidence), f.docIds, f.claimKeys.map((k) => keyToId.get(k)).filter(Boolean),
          f.aiReview ? JSON.stringify(f.aiReview) : null,
        ],
      );
    }

    await c.query(
      `update scans set status = 'complete', stage = 'Complete', progress = 1, finished_at = now(), updated_at = now(),
         claim_count = $2, finding_count = $3 where id = $1`,
      [scanId, claims.length, findings.length],
    );
    await appendAudit(c, {
      actor,
      action: "scan.completed",
      detail: `Scan finished: ${claims.length} claims, ${findings.length} findings${carried ? `, ${carried} earlier decisions carried over` : ""}`,
      collectionId: scan.collection_id,
      scanId,
    });
    return { carried, fresh: findings.length - carried };
  });
}

export async function failScan(scanId: string, message: string) {
  const r = await query<{ collection_id: string }>(
    "update scans set status = 'failed', stage = 'Failed', error = $2, finished_at = now(), updated_at = now() where id = $1 returning collection_id",
    [scanId, message],
  );
  await scanEvent(scanId, message, { level: "error" }).catch(() => {});
  if (r.rows[0]) await appendAudit(null, { actor: "Sherlock", action: "scan.failed", detail: message.slice(0, 300), collectionId: r.rows[0].collection_id, scanId });
}

/* ------------------------------------------------------------------ results */

export async function getResults(scanId: string): Promise<ResultsPayload | null> {
  const scan = await getScan(scanId);
  if (!scan) return null;

  const [docs, claims, findings] = await Promise.all([
    query(
      `select d.id, d.name, d.sha256, sd.title, sd.source, sd.year, to_char(sd.doc_date, 'YYYY-MM-DD') as doc_date, sd.doc_type, sd.doc_status,
              sd.record_status, sd.series, sd.version, sd.in_ai_scope, sd.ai_generated, sd.custody, sd.front_id
         from scan_documents sd join documents d on d.id = sd.document_id where sd.scan_id = $1 order by d.name`,
      [scanId],
    ),
    query("select id, text, origin_doc, status, cited_by, attribute, subject, value from claims where scan_id = $1 order by text", [scanId]),
    query("select * from findings where scan_id = $1 order by created_at, id", [scanId]),
  ]);

  const sourceDocs: SourceDoc[] = docs.rows.map((x) => ({
    id: x.id,
    title: x.title ?? x.name,
    source: x.source ?? "Unknown",
    year: x.year ?? 0,
    date: x.doc_date ?? null,
    docType: x.doc_type,
    docStatus: x.doc_status,
    sha256: x.sha256,
    recordStatus: x.record_status ?? null,
    series: x.series ?? null,
    version: x.version ?? null,
    inAiScope: x.in_ai_scope ?? null,
    aiGenerated: x.ai_generated === true,
    custody: x.custody ?? [],
    frontId: x.front_id ?? null,
  }));
  const claimList: Claim[] = claims.rows.map((x) => ({
    id: x.id, text: x.text, origin: x.origin_doc, citedBy: x.cited_by, status: x.status, attribute: x.attribute, subject: x.subject, value: x.value,
  }));
  const findingList: Finding[] = findings.rows.map(rowToFinding);

  return { collection: { id: scan.collectionId, name: scan.collectionName }, scan, docs: sourceDocs, claims: claimList, findings: findingList };
}

function rowToFinding(x: Record<string, unknown>): Finding {
  return {
    id: x.id as string,
    type: x.type as FindingType,
    kind: x.kind as FindingKind,
    title: x.title as string,
    summary: x.summary as string,
    severity: x.severity as Severity,
    confidence: x.confidence as number,
    status: x.status as FindingStatus,
    evidence: x.evidence as Evidence[],
    docIds: x.doc_ids as string[],
    claimIds: x.claim_ids as string[],
    isNew: x.is_new as boolean,
    note: (x.note as string) ?? null,
    decidedAt: iso(x.decided_at as Date | null),
    aiReview: (x.ai_review as AiReview) ?? null,
  };
}

export async function getFinding(id: string): Promise<(Finding & { scanId: string; collectionId: string; docTitles: Record<string, string> }) | null> {
  const r = await query("select f.*, s.collection_id from findings f join scans s on s.id = f.scan_id where f.id = $1", [id]);
  const row = r.rows[0];
  if (!row) return null;
  const docs = await query(
    `select d.id, coalesce(sd.title, d.name) as title from scan_documents sd join documents d on d.id = sd.document_id where sd.scan_id = $1`,
    [row.scan_id],
  );
  return { ...rowToFinding(row), scanId: row.scan_id, collectionId: row.collection_id, docTitles: Object.fromEntries(docs.rows.map((d) => [d.id, d.title])) };
}

export async function decideFinding(id: string, status: FindingStatus, note: string | null, actor: string): Promise<Finding | null> {
  return tx(async (c) => {
    const cur = await c.query("select f.*, s.collection_id from findings f join scans s on s.id = f.scan_id where f.id = $1 for update of f", [id]);
    const row = cur.rows[0];
    if (!row) return null;
    const upd = await c.query(
      `update findings set status = $2, note = $3, decided_at = case when $2 = 'open' then null else now() end where id = $1 returning *`,
      [id, status, note],
    );
    const verb = status === "confirmed" ? "confirmed" : status === "dismissed" ? "dismissed" : "reopened";
    await appendAudit(c, {
      actor,
      action: `finding.${verb}`,
      detail: `${cap(verb)}: ${row.title}${note ? ` — ${note}` : ""}`,
      collectionId: row.collection_id,
      scanId: row.scan_id,
      findingId: id,
    });
    return rowToFinding(upd.rows[0]);
  });
}
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export async function listScans(collectionId: string): Promise<ScanSummary[]> {
  const r = await query(
    `select s.id, s.started_at, s.status, s.provider, s.doc_count, s.claim_count, s.finding_count,
            (select count(*)::int from findings f where f.scan_id = s.id and f.is_new) as new_count,
            (select count(*)::int from findings f where f.scan_id = s.id and f.status = 'open') as open_count
       from scans s where s.collection_id = $1 order by s.started_at asc`,
    [collectionId],
  );
  return r.rows.map((x) => ({
    id: x.id,
    startedAt: iso(x.started_at)!,
    status: x.status,
    provider: x.provider,
    docCount: x.doc_count,
    claimCount: x.claim_count,
    findingCount: x.finding_count,
    newCount: x.new_count,
    openCount: x.open_count,
  }));
}

/* ------------------------------------------------------------------ extraction cache */

export async function getExtraction<T>(sha256: string, name: string, provider: string): Promise<T | null> {
  const r = await query<{ extracted: T }>("select extracted from document_extractions where sha256 = $1 and name = $2 and provider = $3", [sha256, name, provider]);
  return r.rows[0]?.extracted ?? null;
}

export async function saveExtraction(sha256: string, name: string, provider: string, extracted: unknown): Promise<void> {
  await query(
    `insert into document_extractions (sha256, name, provider, extracted) values ($1,$2,$3,$4)
     on conflict (sha256, name, provider) do update set extracted = excluded.extracted, created_at = now()`,
    [sha256, name, provider, JSON.stringify(extracted)],
  );
}
