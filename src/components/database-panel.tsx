"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Database, LoaderCircle, Lock, Plug } from "lucide-react";
import clsx from "clsx";
import type { ImportItem } from "@/lib/format";

interface TableInfo {
  name: string;
  rows: number;
  columns: string[];
}

type Phase = "idle" | "testing" | "connected" | "error";

const ENGINES = ["PostgreSQL", "MySQL", "SQLite", "SQL Server"] as const;

export function DatabasePanel({ onImport }: { onImport: (items: ImportItem[]) => void }) {
  const [engine, setEngine] = useState<(typeof ENGINES)[number]>("SQLite");
  const [connectionString, setConnectionString] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  async function connect() {
    setPhase("testing");
    setError("");
    try {
      const res = await fetch("/api/sources/database/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not connect.");
      setTables(data.tables);
      setPicked(new Set(data.tables.map((t: TableInfo) => t.name)));
      setPhase("connected");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect.");
      setPhase("error");
    }
  }

  function toggle(name: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function importPicked() {
    setPhase("testing");
    setError("");
    try {
      const res = await fetch("/api/sources/database/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString, tables: [...picked] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed.");
      const items: ImportItem[] = (data.documents as { id: string; title: string }[]).map((d) => ({
        id: d.id,
        name: d.title,
        size: 0,
        ext: "table",
        origin: "database",
        status: "ready",
        progress: 1,
        detail: `${engine} · ${d.id} · scored`,
      }));
      onImport(items);
      setPhase("idle");
      setTables([]);
      setPicked(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
      setPhase("error");
    }
  }

  return (
    <div className="rounded-xl border border-line bg-subtle p-5">
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <Lock className="size-3.5" />
        Use a read-only account. Credentials stay on the server and are never stored in the browser.
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[170px_1fr]">
        <label className="text-[12px] text-muted">
          Database type
          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value as (typeof ENGINES)[number])}
            className="mt-1.5 w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-[13px] text-fg outline-none transition focus:border-accent"
          >
            {ENGINES.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-muted">
          Connection string
          <input
            value={connectionString}
            onChange={(e) => setConnectionString(e.target.value)}
            placeholder="sqlite://data/demo-records.db"
            autoComplete="off"
            spellCheck={false}
            className="mt-1.5 w-full rounded-md border border-line-strong bg-bg px-3 py-2 font-mono text-[12.5px] text-fg outline-none transition placeholder:text-faint focus:border-accent"
          />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={connect}
          disabled={phase === "testing" || connectionString.trim() === ""}
          className="inline-flex items-center gap-2 rounded-md bg-fg px-3.5 py-2 text-[13px] font-medium text-bg transition hover:bg-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {phase === "testing" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
          {phase === "testing" ? "Connecting…" : "Connect and list tables"}
        </button>
        <button
          type="button"
          onClick={() => setConnectionString("sqlite://data/demo-records.db")}
          className="text-[12.5px] text-muted underline-offset-4 transition hover:text-fg hover:underline"
        >
          Use a demo connection
        </button>
      </div>

      <AnimatePresence mode="wait">
        {phase === "error" && (
          <motion.p
            key="err"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
          >
            {error}
          </motion.p>
        )}

        {phase === "connected" && (
          <motion.div
            key="tables"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-5"
          >
            <p className="mb-2 flex items-center gap-2 text-[12px] text-muted">
              <span className="size-1.5 rounded-full bg-success" />
              Connected. Choose the tables to bring in.
              <span className="rounded border border-line px-1.5 py-0.5 text-[10.5px] text-faint">Read-only</span>
            </p>
            <ul className="overflow-hidden rounded-lg border border-line">
              {tables.map((t, i) => {
                const on = picked.has(t.name);
                return (
                  <motion.li
                    key={t.name}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(t.name)}
                      className="flex w-full items-center gap-3 border-b border-line bg-bg px-3.5 py-3 text-left transition last:border-b-0 hover:bg-hover"
                    >
                      <span
                        className={clsx(
                          "grid size-4 place-items-center rounded border transition",
                          on ? "border-accent bg-accent" : "border-line-strong",
                        )}
                      >
                        {on && (
                          <motion.svg
                            viewBox="0 0 12 12"
                            className="size-2.5 text-white"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                          >
                            <motion.path
                              d="M2 6.5 5 9.5 10 3"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              initial={{ pathLength: 0 }}
                              animate={{ pathLength: 1 }}
                              transition={{ duration: 0.2 }}
                            />
                          </motion.svg>
                        )}
                      </span>
                      <Database className="size-4 text-muted" />
                      <span className="flex-1">
                        <span className="block font-mono text-[13px]">{t.name}</span>
                        <span className="block text-[11.5px] text-faint">{t.columns.join(", ")}</span>
                      </span>
                      <span className="text-[12px] text-muted">{t.rows.toLocaleString()} rows</span>
                    </button>
                  </motion.li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={importPicked}
              disabled={picked.size === 0}
              className="mt-3 rounded-md bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Import {picked.size} {picked.size === 1 ? "table" : "tables"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
