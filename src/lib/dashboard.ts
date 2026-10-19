import { query } from "@/lib/db";
import { getResults } from "@/lib/repo";
import { sourceStats } from "@/lib/results-derive";
import type { DashboardPayload, FindingType, InvestigationStatus } from "@/lib/types";

const DAY = 86_400_000;
const WEEKS = 8;
const SEV_RANK = `case severity when 'high' then 0 when 'medium' then 1 else 2 end`;

/** Everything on the dashboard, computed from the latest scan of each collection. */
export async function buildDashboard(): Promise<DashboardPayload> {
  const scans = await query(
    `select distinct on (s.collection_id) s.id, s.collection_id, s.status, s.progress, s.started_at, s.finished_at, s.updated_at, s.doc_count, c.name
       from scans s join collections c on c.id = s.collection_id
      order by s.collection_id, s.started_at desc`,
  );
  const ids: string[] = scans.rows.map((r) => r.id);

  const empty: DashboardPayload = {
    last: null,
    kpis: { openFindings: 0, resolvedThisWeek: 0, documents: 0, agreement: null },
    trend: { labels: trendLabels(), found: Array(WEEKS).fill(0), resolved: Array(WEEKS).fill(0) },
    openByType: { bias: 0, misinformation: 0, disinformation: 0 },
    investigations: [],
    activity: [],
    sourceWatch: [],
  };
  if (!ids.length) return empty;

  const counts = await query(
    `select scan_id,
            count(*)::int as total,
            count(*) filter (where status = 'open')::int as open,
            count(*) filter (where status = 'confirmed')::int as confirmed,
            count(*) filter (where status = 'dismissed')::int as dismissed,
            max(decided_at) as last_decision
       from findings where scan_id = any($1) group by scan_id`,
    [ids],
  );
  const byScan = new Map(counts.rows.map((r) => [r.scan_id as string, r]));

  const investigations = scans.rows.map((s) => {
    const c = byScan.get(s.id);
    const total = c?.total ?? 0;
    const open = c?.open ?? 0;
    const stale = s.status === "running" && Date.now() - new Date(s.updated_at).getTime() > 3 * 60_000;
    const status: InvestigationStatus = stale || s.status === "failed" ? "failed" : s.status === "running" || s.status === "queued" ? "scanning" : open > 0 ? "needs-review" : "resolved";
    const lastActive = new Date(Math.max(new Date(s.finished_at ?? s.started_at).getTime(), c?.last_decision ? new Date(c.last_decision).getTime() : 0));
    return {
      id: s.collection_id as string,
      scanId: s.id as string,
      name: s.name as string,
      documents: s.doc_count as number,
      status,
      progress: status === "scanning" ? Number(s.progress) : total ? (total - open) / total : 1,
      open,
      lastActive: lastActive.toISOString(),
    };
  });
  investigations.sort((a, b) => b.lastActive.localeCompare(a.lastActive));

  const totals = counts.rows.reduce(
    (a, r) => ({ open: a.open + r.open, confirmed: a.confirmed + r.confirmed, dismissed: a.dismissed + r.dismissed }),
    { open: 0, confirmed: 0, dismissed: 0 },
  );

  const openByTypeRows = await query("select type, count(*)::int as n from findings where scan_id = any($1) and status = 'open' group by type", [ids]);
  const openByType = { ...empty.openByType };
  for (const r of openByTypeRows.rows) openByType[r.type as FindingType] = r.n;

  const resolvedWeek = await query("select count(*)::int as n from findings where scan_id = any($1) and decided_at > now() - interval '7 days'", [ids]);

  const trend = await query(
    `select 'found' as k, floor(extract(epoch from (now() - created_at)) / ${DAY / 1000})::int as d from findings where scan_id = any($1)
     union all
     select 'resolved', floor(extract(epoch from (now() - decided_at)) / ${DAY / 1000})::int from findings where scan_id = any($1) and decided_at is not null`,
    [ids],
  );
  const found = Array(WEEKS).fill(0);
  const resolved = Array(WEEKS).fill(0);
  for (const r of trend.rows) {
    const wk = Math.floor(Number(r.d) / 7);
    if (wk < 0 || wk >= WEEKS) continue;
    (r.k === "found" ? found : resolved)[WEEKS - 1 - wk]++;
  }

  const docsTotal = await query("select count(*)::int as n from documents d where d.collection_id = any($1)", [scans.rows.map((s) => s.collection_id)]);

  /* where the user left off: the collection with the most recent activity */
  const lastInv = investigations.find((i) => i.scanId && i.status !== "failed") ?? investigations[0];
  let last: DashboardPayload["last"] = null;
  let sourceWatch: DashboardPayload["sourceWatch"] = [];
  if (lastInv?.scanId) {
    const results = await getResults(lastInv.scanId);
    if (results) {
      const summary = results.findings;
      const open = { bias: 0, misinformation: 0, disinformation: 0 } as Record<FindingType, number>;
      for (const f of summary) if (f.status === "open") open[f.type]++;
      const nextRow = (
        await query(`select * from findings where scan_id = $1 and status = 'open' order by ${SEV_RANK}, confidence desc limit 1`, [lastInv.scanId])
      ).rows[0];
      const docTitle = (id?: string) => results.docs.find((d) => d.id === id);
      const evidence = ((nextRow?.evidence as { label: string; docId?: string; quote: string }[] | undefined) ?? []).slice(0, 2).map((e) => {
        const d = docTitle(e.docId);
        return { label: e.label, text: e.quote.replace(/\[\[|\]\]/g, ""), from: d ? `${d.title}${d.year ? ` · ${d.year}` : ""}` : "" };
      });
      last = {
        scanId: lastInv.scanId,
        collectionId: lastInv.id,
        name: lastInv.name,
        documents: results.docs.length,
        sources: new Set(results.docs.map((d) => d.source)).size,
        lastWorked: lastInv.lastActive,
        reviewed: summary.filter((f) => f.status !== "open").length,
        total: summary.length,
        open,
        next: nextRow
          ? {
              id: nextRow.id,
              type: nextRow.type,
              title: nextRow.title,
              summary: nextRow.summary,
              confidence: nextRow.confidence,
              documents: (nextRow.doc_ids as string[]).length,
              evidence,
            }
          : null,
      };
      sourceWatch = sourceStats(results)
        .filter((s) => s.verdict !== "reliable")
        .slice(0, 6)
        .map((s) => ({
          name: s.name,
          note: s.verdict === "echo" ? "Only repeats other sources" : s.openFlags ? `${s.openFlags} open ${s.openFlags === 1 ? "flag" : "flags"}` : "Has claims under review",
          corroborated: s.buckets.good,
          review: s.buckets.review,
          superseded: s.buckets.superseded,
          single: s.buckets.single,
        }));
    }
  }

  const act = await query(
    `select a.id, a.at, a.action, a.detail, a.finding_id, f.type, c.name as collection
       from audit_log a left join findings f on f.id = a.finding_id left join collections c on c.id = a.collection_id
      where a.action not like 'document.%' order by a.id desc limit 8`,
  );

  return {
    last,
    kpis: {
      openFindings: totals.open,
      resolvedThisWeek: resolvedWeek.rows[0].n,
      documents: docsTotal.rows[0].n,
      agreement: totals.confirmed + totals.dismissed ? Math.round((totals.confirmed / (totals.confirmed + totals.dismissed)) * 100) : null,
    },
    trend: { labels: trendLabels(), found, resolved },
    openByType,
    investigations,
    activity: act.rows.map((r) => ({
      id: String(r.id),
      type: (r.type as FindingType | null) ?? "system",
      text: r.detail,
      where: r.collection ?? "Sherlock",
      at: new Date(r.at).toISOString(),
    })),
    sourceWatch,
  };
}

function trendLabels(): string[] {
  return Array.from({ length: WEEKS }, (_, i) => (i === WEEKS - 1 ? "This week" : `-${WEEKS - 1 - i}w`));
}
