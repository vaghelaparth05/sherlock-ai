"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Copy, Database, Download, LoaderCircle, Search, ShieldCheck, ShieldX, X } from "lucide-react";
import clsx from "clsx";
import { TopNav } from "@/components/top-nav";
import { Reveal } from "@/components/reveal";
import { AnimatedNumber } from "@/components/animated-number";
import { ErrorBlock, Skeleton } from "@/components/page-states";
import { api, readParam } from "@/lib/client";
import type { AuditVerification } from "@/lib/types";

interface TableSummary {
  name: string;
  rows: number;
  description: string;
}
interface Column {
  name: string;
  type: string;
}
interface Page {
  table: string;
  columns: Column[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  sort: string;
  dir: "asc" | "desc";
}

/** Columns whose values are ids of rows in another table. Clicking one jumps there. */
const REFERENCES: Record<string, string> = {
  scan_id: "scans",
  previous_scan_id: "scans",
  collection_id: "collections",
  document_id: "documents",
  origin_doc: "documents",
  finding_id: "findings",
};

const PAGE_SIZES = [25, 50, 100];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function DataView() {
  const [tables, setTables] = useState<TableSummary[] | null>(null);
  const [table, setTable] = useState<string | null>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ col?: string; dir?: "asc" | "desc" }>({});
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  const [open, setOpen] = useState<Record<string, unknown> | null>(null);
  const [verification, setVerification] = useState<AuditVerification | null>(null);
  const req = useRef(0);

  /* table list, and the table named in the URL */
  useEffect(() => {
    let cancelled = false;
    api<{ tables: TableSummary[] }>("/api/data/tables")
      .then((r) => {
        if (cancelled) return;
        setTables(r.tables);
        const want = readParam("table");
        setTable(r.tables.find((t) => t.name === want)?.name ?? r.tables.find((t) => t.name === "findings")?.name ?? r.tables[0]?.name ?? null);
        const initialQ = readParam("q");
        if (initialQ) {
          setQ(initialQ);
          setSearch(initialQ);
        }
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, []);

  /* debounce the search box */
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q);
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    if (!table) return;
    const id = ++req.current;
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set("q", search);
    if (sort.col) params.set("sort", sort.col);
    if (sort.dir) params.set("dir", sort.dir);
    try {
      const p = await api<Page>(`/api/data/tables/${table}?${params}`);
      if (id === req.current) {
        setPage(p);
        setError(null);
      }
    } catch (e) {
      if (id === req.current) setError((e as Error).message);
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, [table, limit, offset, search, sort]);

  useEffect(() => {
    // Fetch whenever the table, page, search or sort changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (table !== "audit_log") return;
    api<{ verification: AuditVerification }>("/api/audit?limit=1").then((r) => setVerification(r.verification)).catch(() => {});
  }, [table]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function go(name: string, query = "") {
    setTable(name);
    setOffset(0);
    setSort({});
    setQ(query);
    setSearch(query);
    setOpen(null);
    const url = new URL(window.location.href);
    url.searchParams.set("table", name);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  }

  function toggleSort(col: string) {
    setOffset(0);
    setSort((s) => (s.col !== col ? { col, dir: "asc" } : s.dir === "asc" ? { col, dir: "desc" } : {}));
  }

  const current = tables?.find((t) => t.name === table);
  const from = page ? (page.total === 0 ? 0 : page.offset + 1) : 0;
  const to = page ? Math.min(page.total, page.offset + page.rows.length) : 0;
  const csvHref = useMemo(() => {
    if (!table) return "#";
    const params = new URLSearchParams({ format: "csv" });
    if (search) params.set("q", search);
    if (sort.col) params.set("sort", sort.col);
    if (sort.dir) params.set("dir", sort.dir);
    return `/api/data/tables/${table}?${params}`;
  }, [table, search, sort]);

  return (
    <div className="relative min-h-screen">
      <div className="grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-[300px]" aria-hidden />
      <TopNav active="data" />

      <main className="relative mx-auto max-w-[88rem] px-5 pb-24 pt-10">
        <Reveal>
          <p className="text-[12px] text-faint">Read-only view of Sherlock&apos;s own database</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Data explorer</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-muted">Everything Sherlock has stored: documents, scans, claims, findings and the audit log. Click an id to follow it to the row it points at.</p>
        </Reveal>

        {error && !tables && <div className="mt-8"><ErrorBlock message={error} onRetry={() => window.location.reload()} /></div>}
        {!tables && !error && <div className="mt-8"><Skeleton rows={1} /></div>}

        {tables && (
          <div className="mt-8 grid gap-6 lg:grid-cols-[240px_1fr]">
            <nav aria-label="Tables" className="lg:sticky lg:top-20 lg:self-start">
              <ul className="space-y-1">
                {tables.map((t, i) => (
                  <motion.li key={t.name} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                    <button
                      type="button"
                      onClick={() => go(t.name)}
                      aria-current={t.name === table}
                      className={clsx(
                        "group relative flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        t.name === table ? "border-line-strong bg-elevated" : "border-transparent hover:bg-hover",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Database className={clsx("size-3.5 shrink-0", t.name === table ? "text-fg" : "text-faint")} />
                        <span className="truncate font-mono text-[12.5px]">{t.name}</span>
                      </span>
                      <span className="rounded-full bg-bg px-2 py-px text-[11px] tabular-nums text-muted">{t.rows}</span>
                    </button>
                  </motion.li>
                ))}
              </ul>
            </nav>

            <section className="min-w-0">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-mono text-lg font-medium">{table}</h2>
                  <p className="mt-0.5 text-[13px] text-muted">{current?.description}</p>
                </div>
                {table === "audit_log" && verification && (
                  <p className={clsx("inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px]", verification.ok ? "border-line text-muted" : "border-danger/40 bg-danger-soft text-danger")}>
                    {verification.ok ? <ShieldCheck className="size-4 text-success" /> : <ShieldX className="size-4" />}
                    {verification.ok ? `Chain verified: ${verification.entries} entries, none altered` : `Chain broken at entry #${verification.brokenAt}`}
                  </p>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <label className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={`Search every column of ${table}`}
                    className="w-full rounded-md border border-line-strong bg-bg py-2 pl-9 pr-8 text-[13px] outline-none transition placeholder:text-faint focus:border-accent"
                  />
                  {q && (
                    <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint transition hover:text-fg">
                      <X className="size-3.5" />
                    </button>
                  )}
                </label>
                <label className="inline-flex items-center gap-2 text-[12.5px] text-muted">
                  Rows
                  <select
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value));
                      setOffset(0);
                    }}
                    className="rounded-md border border-line-strong bg-bg px-2.5 py-1.5 text-[12.5px] text-fg outline-none transition focus:border-accent"
                  >
                    {PAGE_SIZES.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <a href={csvHref} className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-elevated px-3 py-2 text-[12.5px] transition hover:bg-hover active:scale-[0.97]">
                  <Download className="size-3.5" />
                  CSV
                </a>
              </div>

              <div className="relative mt-4 overflow-hidden rounded-xl border border-line bg-subtle">
                {loading && <LoaderCircle className="absolute right-3 top-3 z-10 size-4 animate-spin text-muted" />}
                {error && tables && <div className="p-4"><ErrorBlock message={error} onRetry={load} /></div>}
                {page && (
                  <div className="max-h-[68vh] overflow-auto">
                    <table className="w-full min-w-max border-collapse text-[12.5px]">
                      <thead className="sticky top-0 z-[1] bg-elevated">
                        <tr>
                          {page.columns.map((c) => (
                            <th key={c.name} className="border-b border-line px-3 py-2.5 text-left font-medium">
                              <button type="button" onClick={() => toggleSort(c.name)} className="group inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[11.5px] text-muted transition hover:text-fg">
                                {c.name}
                                {page.sort === c.name ? (page.dir === "asc" ? <ArrowUp className="size-3 text-fg" /> : <ArrowDown className="size-3 text-fg" />) : <ArrowDown className="size-3 opacity-0 group-hover:opacity-40" />}
                              </button>
                              <span className="block text-[10px] font-normal text-faint">{typeLabel(c.type)}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence initial={false} mode="popLayout">
                          {page.rows.map((row, i) => (
                            <motion.tr
                              key={`${page.table}-${page.offset}-${i}`}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: Math.min(i, 14) * 0.02, duration: 0.25 }}
                              onClick={() => setOpen(row)}
                              className="cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-elevated"
                            >
                              {page.columns.map((c) => (
                                <td key={c.name} className="max-w-[320px] px-3 py-2 align-top">
                                  <Cell column={c} value={row[c.name]} onFollow={go} />
                                </td>
                              ))}
                            </motion.tr>
                          ))}
                        </AnimatePresence>
                      </tbody>
                    </table>
                    {page.rows.length === 0 && (
                      <p className="px-4 py-14 text-center text-[13px] text-muted">{search ? "No rows match your search." : "This table is empty. Scan some documents to fill it."}</p>
                    )}
                  </div>
                )}
              </div>

              {page && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-muted">
                  <span>
                    {from}-{to} of <AnimatedNumber value={page.total} className="tabular-nums" /> {page.total === 1 ? "row" : "rows"}
                    {search && " matching"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="rounded-md border border-line-strong p-1.5 transition hover:bg-hover disabled:opacity-35" aria-label="Previous page">
                      <ChevronLeft className="size-4" />
                    </button>
                    <button type="button" disabled={to >= page.total} onClick={() => setOffset(offset + limit)} className="rounded-md border border-line-strong p-1.5 transition hover:bg-hover disabled:opacity-35" aria-label="Next page">
                      <ChevronRight className="size-4" />
                    </button>
                  </span>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <RowDrawer row={open} columns={page?.columns ?? []} table={table} onClose={() => setOpen(null)} onFollow={go} />
    </div>
  );
}

function typeLabel(t: string) {
  if (t === "timestamp with time zone") return "timestamp";
  if (t === "ARRAY") return "list";
  if (t === "bytea") return "binary";
  if (t === "character varying") return "text";
  return t;
}

const fmtDate = (v: unknown) => {
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "medium" });
};

function Cell({ column, value, onFollow }: { column: Column; value: unknown; onFollow: (table: string, q: string) => void }) {
  if (value === null || value === undefined) return <span className="text-faint">null</span>;

  const ref = REFERENCES[column.name];
  if (typeof value === "string" && UUID.test(value)) {
    return ref ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onFollow(ref, value);
        }}
        title={`Open in ${ref}`}
        className="font-mono text-[11.5px] text-accent underline-offset-2 hover:underline"
      >
        {value.slice(0, 8)}…
      </button>
    ) : (
      <span className="font-mono text-[11.5px] text-muted" title={value}>
        {value.slice(0, 8)}…
      </span>
    );
  }
  if (column.type === "bytea") return <span className="text-muted">{formatBytes(Number(value))}</span>;
  if (column.type === "boolean") return <span className={value ? "text-success" : "text-faint"}>{value ? "true" : "false"}</span>;
  if (column.type.startsWith("timestamp") || column.type === "date") return <span className="whitespace-nowrap text-muted">{fmtDate(value)}</span>;
  if (column.type === "jsonb" || column.type === "json") {
    const text = JSON.stringify(value);
    return <span className="block truncate font-mono text-[11.5px] text-muted" title={text}>{text}</span>;
  }
  if (Array.isArray(value)) return <span className="rounded-full bg-bg px-2 py-px text-[11px] text-muted">{value.length} {value.length === 1 ? "item" : "items"}</span>;
  if (typeof value === "number") return <span className="tabular-nums">{value}</span>;
  const s = String(value);
  if (column.name === "status") return <StatusChip value={s} />;
  return <span className="block truncate" title={s}>{s}</span>;
}

const STATUS_COLORS: Record<string, string> = {
  open: "var(--misinfo)",
  confirmed: "var(--success)",
  dismissed: "var(--fg-muted)",
  complete: "var(--success)",
  running: "var(--accent)",
  failed: "var(--danger)",
  done: "var(--success)",
  corroborated: "var(--success)",
  current: "var(--success)",
  superseded: "var(--disinfo)",
  review: "var(--misinfo)",
  single: "var(--fg-muted)",
};
function StatusChip({ value }: { value: string }) {
  const color = STATUS_COLORS[value];
  if (!color) return <span className="block truncate">{value}</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {value}
    </span>
  );
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function RowDrawer({
  row,
  columns,
  table,
  onClose,
  onFollow,
}: {
  row: Record<string, unknown> | null;
  columns: Column[];
  table: string | null;
  onClose: () => void;
  onFollow: (table: string, q: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <AnimatePresence>
      {row && (
        <>
          <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" aria-hidden />
          <motion.aside
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label={`${table} row`}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-line-strong bg-bg shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line p-5">
              <div>
                <p className="text-[12px] text-faint">Row in</p>
                <h2 className="font-mono text-base font-medium">{table}</h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(JSON.stringify(row, null, 2));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1400);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-2.5 py-1.5 text-[12px] text-muted transition hover:bg-hover hover:text-fg"
                >
                  <Copy className="size-3.5" />
                  {copied ? "Copied" : "Copy JSON"}
                </button>
                <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted transition hover:bg-hover hover:text-fg">
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <dl className="flex-1 space-y-4 overflow-y-auto p-5">
              {columns.map((c) => {
                const v = row[c.name];
                const ref = REFERENCES[c.name];
                return (
                  <div key={c.name}>
                    <dt className="font-mono text-[11.5px] text-faint">
                      {c.name} <span className="text-faint/70">· {typeLabel(c.type)}</span>
                    </dt>
                    <dd className="mt-1 break-words text-[13px]">
                      {v === null || v === undefined ? (
                        <span className="text-faint">null</span>
                      ) : typeof v === "object" ? (
                        <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-subtle p-3 font-mono text-[11.5px] leading-relaxed">{JSON.stringify(v, null, 2)}</pre>
                      ) : c.type === "bytea" ? (
                        formatBytes(Number(v))
                      ) : c.type.startsWith("timestamp") ? (
                        fmtDate(v)
                      ) : ref && typeof v === "string" ? (
                        <button type="button" onClick={() => onFollow(ref, v)} className="font-mono text-[12.5px] text-accent underline-offset-2 hover:underline">
                          {v} <span className="text-faint">→ {ref}</span>
                        </button>
                      ) : (
                        <span className={c.name === "hash" || c.name === "sha256" || c.name === "prev_hash" ? "font-mono text-[12px]" : ""}>{String(v)}</span>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
