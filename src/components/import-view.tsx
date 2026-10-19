"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { LoaderCircle, Sparkles } from "lucide-react";
import clsx from "clsx";
import { TopNav } from "@/components/top-nav";
import { Dropzone } from "@/components/dropzone";
import { FileRow } from "@/components/file-row";
import { DatabasePanel } from "@/components/database-panel";
import { SummaryPanel, type ScannerInfo } from "@/components/summary-panel";
import { api, postJson, readParam } from "@/lib/client";
import type { ImportItem } from "@/lib/format";
import type { CollectionInfo, ImportedDocument } from "@/lib/types";

const TABS = [
  { id: "upload", label: "Upload files" },
  { id: "database", label: "Database" },
  { id: "sample", label: "NAA sample" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const extOf = (name: string) => (name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "");

const toItem = (d: ImportedDocument): ImportItem => ({
  id: d.id,
  name: d.name,
  size: d.size,
  ext: d.ext,
  origin: "upload",
  status: "ready",
  progress: 1,
  hash: d.sha256,
});

function uploadFile(file: File, collectionId: string, onProgress: (p: number) => void): Promise<ImportedDocument> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { error?: string } & Partial<ImportedDocument> = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as ImportedDocument);
      else reject(new Error(body.error ?? "Upload failed."));
    };
    xhr.onerror = () => reject(new Error("Network error."));
    const form = new FormData();
    form.append("file", file);
    form.append("collection", collectionId);
    xhr.send(form);
  });
}

/** Runs at most `limit` jobs at once. */
function createQueue(limit: number) {
  const waiting: (() => Promise<void>)[] = [];
  let running = 0;
  const pump = () => {
    while (running < limit && waiting.length) {
      const job = waiting.shift()!;
      running++;
      job().finally(() => {
        running--;
        pump();
      });
    }
  };
  return (job: () => Promise<void>) => {
    waiting.push(job);
    pump();
  };
}

export function ImportView() {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("upload");
  const [items, setItems] = useState<ImportItem[]>([]);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [scanner, setScanner] = useState<ScannerInfo | null>(null);
  const [rulesOnly, setRulesOnly] = useState(false);
  const [rereadAll, setRereadAll] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [startError, setStartError] = useState("");
  const [starting, setStarting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [enqueue] = useState(() => createQueue(4));
  const files = useRef(new Map<string, File>());
  const creating = useRef<Promise<string> | null>(null);
  const idRef = useRef<string | null>(null);
  const nameRef = useRef("");
  useEffect(() => {
    idRef.current = collectionId;
    nameRef.current = name;
  }, [collectionId, name]);

  const flash = useCallback((m: string) => {
    setNotice(m);
    window.setTimeout(() => setNotice(""), 3600);
  }, []);

  const patch = useCallback((id: string, change: Partial<ImportItem>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...change } : i))), []);

  const refreshCollections = useCallback(async () => {
    const r = await api<{ collections: CollectionInfo[] }>("/api/collections");
    setCollections(r.collections);
    return r.collections;
  }, []);

  const openCollection = useCallback(
    async (id: string | null, list?: CollectionInfo[]) => {
      files.current.clear();
      setCollectionId(id);
      idRef.current = id;
      const url = new URL(window.location.href);
      if (id) url.searchParams.set("collection", id);
      else url.searchParams.delete("collection");
      window.history.replaceState(null, "", url);
      if (!id) {
        setItems([]);
        setName("");
        return;
      }
      const docs = await api<{ documents: ImportedDocument[] }>(`/api/documents?collection=${id}`);
      setItems(docs.documents.map(toItem));
      const c = (list ?? collections).find((x) => x.id === id);
      if (c) setName(c.name);
    },
    [collections],
  );

  /* first load: collections, scanner, and the collection named in the URL */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, cfg] = await Promise.all([refreshCollections(), api<ScannerInfo>("/api/config")]);
        if (cancelled) return;
        setScanner(cfg);
        const fromUrl = readParam("collection");
        if (fromUrl && list.some((c) => c.id === fromUrl)) await openCollection(fromUrl, list);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Creates the collection the first time something is added, once even if many files arrive together. */
  const ensureCollection = useCallback(async (): Promise<string> => {
    if (idRef.current) return idRef.current;
    if (!creating.current) {
      creating.current = postJson<{ id: string; name: string }>("/api/collections", { name: nameRef.current.trim() || "Untitled collection" })
        .then(async (c) => {
          idRef.current = c.id;
          setCollectionId(c.id);
          setName(c.name);
          const url = new URL(window.location.href);
          url.searchParams.set("collection", c.id);
          window.history.replaceState(null, "", url);
          await refreshCollections();
          return c.id;
        })
        .finally(() => {
          creating.current = null;
        });
    }
    return creating.current;
  }, [refreshCollections]);

  const send = useCallback(
    (clientId: string) => {
      const file = files.current.get(clientId);
      if (!file) return;
      patch(clientId, { status: "uploading", progress: 0, error: undefined });
      enqueue(async () => {
        try {
          const cid = await ensureCollection();
          const doc = await uploadFile(file, cid, (p) => patch(clientId, { progress: p }));
          files.current.delete(clientId);
          setItems((prev) => prev.map((i) => (i.id === clientId ? { ...toItem(doc) } : i)));
        } catch (e) {
          patch(clientId, { status: "error", error: (e as Error).message });
        }
      });
    },
    [enqueue, ensureCollection, patch],
  );

  const addFiles = useCallback(
    (incoming: File[]) => {
      setTab("upload");
      const fresh: ImportItem[] = [];
      let skipped = 0;
      for (const file of incoming) {
        const dupe = items.some((i) => i.name === file.name && i.size === file.size) || fresh.some((i) => i.name === file.name && i.size === file.size);
        if (dupe) {
          skipped++;
          continue;
        }
        const id = crypto.randomUUID();
        files.current.set(id, file);
        fresh.push({ id, name: file.name, size: file.size, ext: extOf(file.name), origin: "upload", status: "uploading", progress: 0 });
      }
      if (skipped) flash(`${skipped} duplicate${skipped > 1 ? "s" : ""} skipped.`);
      if (!fresh.length) return;
      setItems((prev) => [...prev, ...fresh]);
      fresh.forEach((f) => send(f.id));
    },
    [items, send, flash],
  );

  const remove = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      files.current.delete(id);
      if (item?.status === "ready") fetch(`/api/documents/${id}`, { method: "DELETE" }).catch(() => {});
    },
    [items],
  );

  const clearAll = useCallback(() => {
    items.filter((i) => i.status === "ready").forEach((i) => fetch(`/api/documents/${i.id}`, { method: "DELETE" }).catch(() => {}));
    files.current.clear();
    setItems([]);
  }, [items]);

  async function loadSample(set: "naa" | "corpus") {
    setSampleBusy(true);
    setError("");
    try {
      const s = await postJson<{ id: string; added: number; total: number }>(`/api/samples/${set}`, {});
      const list = await refreshCollections();
      await openCollection(s.id, list);
      setTab("upload");
      flash(s.added ? `Added ${s.added} sample documents.` : "The sample collection is already loaded.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSampleBusy(false);
    }
  }

  async function onDatabaseImported(count: number) {
    const id = idRef.current;
    if (id) {
      const docs = await api<{ documents: ImportedDocument[] }>(`/api/documents?collection=${id}`);
      setItems(docs.documents.map(toItem));
    }
    flash(`Imported ${count} ${count === 1 ? "table" : "tables"} as documents.`);
    setTab("upload");
    void refreshCollections();
  }

  async function start() {
    setStarting(true);
    setStartError("");
    try {
      const cid = await ensureCollection();
      const r = await postJson<{ id: string }>("/api/scans", { collectionId: cid, provider: rulesOnly ? "rules" : undefined, fresh: rereadAll || undefined });
      router.push(`/scan?scan=${r.id}`);
    } catch (e) {
      setStartError((e as Error).message);
      setStarting(false);
    }
  }

  return (
    <div className="relative min-h-screen">
      <div className="grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden />
      <TopNav active="import" />

      <main className="relative mx-auto max-w-6xl px-5 pb-24 pt-12">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-subtle px-2.5 py-1 text-[12px] text-muted">
            <span className="breathe size-1.5 rounded-full bg-success" />
            Step 1 of 5
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Import documents</h1>
          <p className="mt-2 max-w-xl text-[15px] text-muted">
            Bring in the documents you want Sherlock to investigate. Upload files, connect a database, or start with the NAA sample set.
          </p>
        </motion.div>

        {error && (
          <p className="mt-6 rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-[13px] text-danger">{error}</p>
        )}

        <div className="mt-9 grid gap-6 lg:grid-cols-[1fr_340px]">
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }} className="min-w-0">
            <label className="mb-4 flex flex-wrap items-center gap-3 text-[12.5px] text-muted">
              Collection
              <select
                value={collectionId ?? ""}
                onChange={(e) => void openCollection(e.target.value || null)}
                className="min-w-[220px] rounded-md border border-line-strong bg-bg px-3 py-2 text-[13px] text-fg outline-none transition focus:border-accent"
              >
                <option value="">New collection</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.documentCount})
                  </option>
                ))}
              </select>
            </label>

            <div role="tablist" className="mb-4 flex gap-1 border-b border-line">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={clsx("relative px-3.5 py-2.5 text-[13.5px] transition-colors", tab === t.id ? "text-fg" : "text-muted hover:text-fg")}
                >
                  {t.label}
                  {tab === t.id && <motion.span layoutId="tab-underline" className="absolute inset-x-0 -bottom-px h-px bg-fg" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                {tab === "upload" && <Dropzone onFiles={addFiles} />}
                {tab === "database" && <DatabasePanel ensureCollection={ensureCollection} onImported={onDatabaseImported} />}
                {tab === "sample" && (
                  <div className="rounded-xl border border-line bg-subtle p-6">
                    <span className="mb-3 grid size-9 place-items-center rounded-md border border-line-strong bg-elevated">
                      <Sparkles className="size-4" />
                    </span>
                    <p className="text-[15px] font-medium">Regional infrastructure grants (synthetic)</p>
                    <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-muted">
                      Ten invented documents about a fictional Records Authority: the authority itself, an old retention schedule, a policy, a staff guide, an FAQ, a budget paper, two
                      registers, a fingerprint manifest, and a 1987 series description. They contain superseded retention periods, a document that no longer matches its fingerprint,
                      a citation to an authority that does not exist, and outdated terminology, so you can see every kind of finding.
                    </p>
                    <button
                      type="button"
                      onClick={() => loadSample("naa")}
                      disabled={sampleBusy}
                      className="mt-4 inline-flex items-center gap-2 rounded-md bg-fg px-3.5 py-2 text-[13px] font-medium text-bg transition hover:bg-white active:scale-[0.97] disabled:opacity-60"
                    >
                      {sampleBusy && <LoaderCircle className="size-3.5 animate-spin" />}
                      Load the 10 sample documents
                    </button>
                    <div className="mt-6 border-t border-line pt-5">
                      <p className="text-[15px] font-medium">Household relief grant corpus (synthetic)</p>
                      <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-muted">
                        Nineteen records about one grant program: two versions of the guidelines, scripts, an intranet FAQ, minutes, procedures, newsletters and an AI-generated
                        summary. Old figures survive in places, some records the AI cannot see contradict what it says, and the AI summary was never reviewed.
                      </p>
                      <button
                        type="button"
                        onClick={() => loadSample("corpus")}
                        disabled={sampleBusy}
                        className="mt-4 inline-flex items-center gap-2 rounded-md bg-fg px-3.5 py-2 text-[13px] font-medium text-bg transition hover:bg-white active:scale-[0.97] disabled:opacity-60"
                      >
                        {sampleBusy && <LoaderCircle className="size-3.5 animate-spin" />}
                        Load the 19 corpus documents
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <AnimatePresence>
              {notice && (
                <motion.p key="notice" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 rounded-md border border-line bg-elevated px-3 py-2 text-[12.5px] text-muted">
                  {notice}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="mt-6">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-[13px] font-medium text-muted">{items.length === 0 ? "Nothing added yet" : `${items.length} item${items.length > 1 ? "s" : ""}`}</h2>
              </div>

              {items.length === 0 ? (
                <p className="rounded-xl border border-line bg-subtle px-5 py-8 text-center text-[13px] text-faint">
                  {loaded ? "Documents you add will appear here with their fingerprint." : "Loading…"}
                </p>
              ) : (
                <ul className="overflow-hidden rounded-xl border border-line bg-subtle">
                  <AnimatePresence initial={false}>
                    {items.map((item) => (
                      <FileRow key={item.id} item={item} onRemove={remove} onRetry={send} />
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>
          </motion.section>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}>
            <SummaryPanel
              items={items}
              collectionName={name}
              nameLocked={!!collectionId}
              onNameChange={setName}
              scanner={scanner}
              rulesOnly={rulesOnly}
              onRulesOnly={setRulesOnly}
              rereadAll={rereadAll}
              onRereadAll={setRereadAll}
              canReread={!!collectionId && (collections.find((c) => c.id === collectionId)?.latestScanId ?? null) !== null}
              starting={starting}
              error={startError}
              onClear={clearAll}
              onStart={start}
            />
          </motion.div>
        </div>
      </main>
    </div>
  );
}
