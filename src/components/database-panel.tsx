"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Database, LoaderCircle, Lock, Plug } from "lucide-react";
import clsx from "clsx";
import { postJson } from "@/lib/client";

interface TableInfo {
  schema: string;
  name: string;
  rows: number;
  columns: string[];
}

type Phase = "idle" | "testing" | "connected" | "importing" | "error";

const key = (t: { schema: string; name: string }) => `${t.schema}.${t.name}`;

export function DatabasePanel({ ensureCollection, onImported }: { ensureCollection: () => Promise<string>; onImported: (count: number) => void }) {
  const [connectionString, setConnectionString] = useState("");
  const [demo, setDemo] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  async function connect(useDemo: boolean) {
    setPhase("testing");
    setError("");
    setDemo(useDemo);
    try {
      const data = await postJson<{ tables: TableInfo[] }>("/api/sources/database/test", { connectionString, demo: useDemo });
      setTables(data.tables);
      setPicked(new Set(data.tables.map(key)));
      setPhase("connected");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  const toggle = (k: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  async function importPicked() {
    setPhase("importing");
    setError("");
    try {
      const collectionId = await ensureCollection();
      const chosen = tables.filter((t) => picked.has(key(t))).map((t) => ({ schema: t.schema, name: t.name }));
      const out = await postJson<{ imported: unknown[] }>("/api/sources/database/import", { collectionId, tables: chosen, connectionString, demo });
      onImported(out.imported.length);
      setPhase("idle");
      setTables([]);
      setPicked(new Set());
    } catch (e) {
      setError((e as Error).message);
      setPhase("connected");
    }
  }

  const busy = phase === "testing" || phase === "importing";

  return (
    <div className="rounded-xl border border-line bg-subtle p-5">
      <div className="flex items-start gap-2 text-[13px] text-muted">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Read-only. Sherlock opens a read-only session, takes the first 1,000 rows of each table you choose, and stores them as CSV documents. Use an account that can only read.
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[170px_1fr]">
        <label className="text-[12px] text-muted">
          Database type
          <select className="mt-1.5 w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-[13px] text-fg outline-none transition focus:border-accent" defaultValue="PostgreSQL">
            <option>PostgreSQL</option>
            <option disabled>MySQL (coming soon)</option>
            <option disabled>SQL Server (coming soon)</option>
          </select>
        </label>
        <label className="text-[12px] text-muted">
          Connection string
          <input
            value={connectionString}
            onChange={(e) => setConnectionString(e.target.value)}
            placeholder="postgres://reader:password@db.internal:5432/records"
            autoComplete="off"
            spellCheck={false}
            className="mt-1.5 w-full rounded-md border border-line-strong bg-bg px-3 py-2 font-mono text-[12.5px] text-fg outline-none transition placeholder:text-faint focus:border-accent"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => connect(false)}
          disabled={busy || connectionString.trim() === ""}
          className="inline-flex items-center gap-2 rounded-md bg-fg px-3.5 py-2 text-[13px] font-medium text-bg transition hover:bg-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {phase === "testing" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
          {phase === "testing" ? "Connecting…" : "Connect and list tables"}
        </button>
        <button type="button" onClick={() => connect(true)} disabled={busy} className="text-[12.5px] text-muted underline-offset-4 transition hover:text-fg hover:underline disabled:opacity-50">
          Use the demo database
        </button>
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.p key="err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
            {error}
          </motion.p>
        )}

        {(phase === "connected" || phase === "importing") && (
          <motion.div key="tables" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5">
            <p className="mb-2 flex items-center gap-2 text-[12px] text-muted">
              <span className="size-1.5 rounded-full bg-success" />
              Connected{demo ? " to the demo database" : ""}. Choose the tables to bring in.
            </p>
            {tables.length === 0 ? (
              <p className="rounded-lg border border-line px-3.5 py-4 text-[13px] text-muted">No readable tables were found.</p>
            ) : (
              <ul className="max-h-72 overflow-y-auto rounded-lg border border-line">
                {tables.map((t, i) => {
                  const k = key(t);
                  const on = picked.has(k);
                  return (
                    <motion.li key={k} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 10) * 0.05 }}>
                      <button type="button" onClick={() => toggle(k)} className="flex w-full items-center gap-3 border-b border-line bg-bg px-3.5 py-3 text-left transition last:border-b-0 hover:bg-hover">
                        <span className={clsx("grid size-4 place-items-center rounded border transition", on ? "border-accent bg-accent" : "border-line-strong")}>
                          {on && (
                            <svg viewBox="0 0 12 12" className="size-2.5 text-white">
                              <motion.path d="M2 6.5 5 9.5 10 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.2 }} />
                            </svg>
                          )}
                        </span>
                        <Database className="size-4 text-muted" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[13px]">{k}</span>
                          <span className="block truncate text-[11.5px] text-faint">{t.columns.join(", ")}</span>
                        </span>
                        <span className="shrink-0 text-[12px] text-muted">{t.rows.toLocaleString()} rows</span>
                      </button>
                    </motion.li>
                  );
                })}
              </ul>
            )}
            <button
              type="button"
              onClick={importPicked}
              disabled={picked.size === 0 || phase === "importing"}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {phase === "importing" && <LoaderCircle className="size-3.5 animate-spin" />}
              {phase === "importing" ? "Importing…" : `Import ${picked.size} ${picked.size === 1 ? "table" : "tables"}`}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
