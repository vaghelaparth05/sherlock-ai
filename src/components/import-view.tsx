"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles } from "lucide-react";
import clsx from "clsx";
import { TopNav } from "@/components/top-nav";
import { Dropzone } from "@/components/dropzone";
import { FileRow } from "@/components/file-row";
import { DatabasePanel } from "@/components/database-panel";
import { SummaryPanel } from "@/components/summary-panel";
import { SAMPLE_COLLECTION, type ImportItem } from "@/lib/format";

const TABS = [
  { id: "upload", label: "Upload files" },
  { id: "database", label: "Database" },
  { id: "sample", label: "Sample set" },
] as const;
type TabId = (typeof TABS)[number]["id"];

interface ServerDoc {
  id: string;
  name: string;
  size: number;
  ext: string;
  hash: string;
}

function extOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function uploadFile(file: File, collection: string, onProgress: (p: number) => void): Promise<ServerDoc> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { error?: string } & Partial<ServerDoc> = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as ServerDoc);
      else reject(new Error(body.error ?? "Upload failed."));
    };
    xhr.onerror = () => reject(new Error("Network error."));
    const form = new FormData();
    form.append("file", file);
    form.append("collection", collection);
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
  const [collection, setCollection] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [navigateAfterUpload, setNavigateAfterUpload] = useState(false);
  const [enqueue] = useState(() => createQueue(4));
  const files = useRef(new Map<string, File>());
  const collectionRef = useRef(collection);
  const startInvestigation = useCallback(() => {
    const ready = items.filter((item) => item.status === "ready");
    if (!ready.length) return;
    try {
      sessionStorage.setItem("sherlock-investigation", JSON.stringify({
        collection: collection.trim() || "Untitled collection",
        documents: ready,
      }));
      router.push("/scan");
    } catch {
      setNotice("Could not open the investigation. Allow browser storage and try again.");
    }
  }, [items, collection, router]);

  useEffect(() => {
    if (!navigateAfterUpload || !items.length || items.some((item) => item.status !== "ready")) return;
    const navigation = window.setTimeout(startInvestigation, 250);
    return () => window.clearTimeout(navigation);
  }, [navigateAfterUpload, items, startInvestigation]);
  useEffect(() => {
    collectionRef.current = collection;
  }, [collection]);

  const patch = useCallback((id: string, change: Partial<ImportItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...change } : i)));
  }, []);

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }, []);

  /* Restore files already stored on the server so a refresh does not lose them. */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/documents")
      .then((r) => r.json())
      .then((data: { documents: (ServerDoc & { collection: string })[] }) => {
        if (cancelled) return;
        setItems(
          data.documents.map((d) => ({
            id: d.id,
            name: d.name,
            size: d.size,
            ext: d.ext,
            origin: "upload" as const,
            status: "ready" as const,
            progress: 1,
            hash: d.hash,
          })),
        );
        const last = data.documents.at(-1);
        if (last?.collection && last.collection !== "Untitled collection") setCollection(last.collection);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const send = useCallback(
    (clientId: string) => {
      const file = files.current.get(clientId);
      if (!file) return;
      patch(clientId, { status: "uploading", progress: 0, error: undefined });
      enqueue(async () => {
        try {
          const doc = await uploadFile(file, collectionRef.current, (p) => patch(clientId, { progress: p }));
          files.current.delete(clientId);
          setItems((prev) =>
            prev.map((i) =>
              i.id === clientId
                ? { ...i, id: doc.id, name: doc.name, size: doc.size, status: "ready", progress: 1, hash: doc.hash }
                : i,
            ),
          );
        } catch (e) {
          patch(clientId, { status: "error", error: e instanceof Error ? e.message : "Upload failed." });
        }
      });
    },
    [enqueue, patch],
  );

  const addFiles = useCallback(
    (incoming: File[]) => {
      setTab("upload");
      const fresh: ImportItem[] = [];
      let skipped = 0;
      for (const file of incoming) {
        const dupe = items.some((i) => i.name === file.name && i.size === file.size) ||
          fresh.some((i) => i.name === file.name && i.size === file.size);
        if (dupe) {
          skipped++;
          continue;
        }
        const id = crypto.randomUUID();
        files.current.set(id, file);
        fresh.push({
          id,
          name: file.name,
          size: file.size,
          ext: extOf(file.name),
          origin: "upload",
          status: "uploading",
          progress: 0,
        });
      }
      if (skipped) flash(`${skipped} duplicate${skipped > 1 ? "s" : ""} skipped.`);
      if (!fresh.length) return;
      setNavigateAfterUpload(true);
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
      if (item?.origin === "upload" && item.status === "ready") {
        fetch(`/api/documents/${id}`, { method: "DELETE" }).catch(() => {});
      }
    },
    [items],
  );

  const clearAll = useCallback(() => {
    setNavigateAfterUpload(false);
    items
      .filter((i) => i.origin === "upload" && i.status === "ready")
      .forEach((i) => fetch(`/api/documents/${i.id}`, { method: "DELETE" }).catch(() => {}));
    files.current.clear();
    setItems([]);
  }, [items]);

  const addSample = () => {
    if (items.some((i) => i.origin === "sample")) {
      flash("The sample set is already added.");
      return;
    }
    setItems((prev) => [
      ...prev,
      ...SAMPLE_COLLECTION.map((d) => ({
        ...d,
        id: crypto.randomUUID(),
        origin: "sample" as const,
        status: "ready" as const,
        progress: 1,
      })),
    ]);
    if (!collection) setCollection("Staff leave policy");
    setTab("upload");
  };

  return (
    <div className="relative min-h-screen">
      <div className="grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden />
      <TopNav active={0} />

      <main className="relative mx-auto max-w-6xl px-5 pb-24 pt-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-subtle px-2.5 py-1 text-[12px] text-muted">
            <span className="breathe size-1.5 rounded-full bg-success" />
            Step 1 of 5
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Import documents</h1>
          <p className="mt-2 max-w-xl text-[15px] text-muted">
            Bring in the documents you want Sherlock to investigate. Upload files, connect a database, or start with a
            sample set.
          </p>
        </motion.div>

        <div className="mt-9 grid gap-6 lg:grid-cols-[1fr_340px]">
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="min-w-0"
          >
            <div role="tablist" className="mb-4 flex gap-1 border-b border-line">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={clsx(
                    "relative px-3.5 py-2.5 text-[13.5px] transition-colors",
                    tab === t.id ? "text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {t.label}
                  {tab === t.id && (
                    <motion.span
                      layoutId="tab-underline"
                      className="absolute inset-x-0 -bottom-px h-px bg-fg"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                {tab === "upload" && <Dropzone onFiles={addFiles} />}
                {tab === "database" && (
                  <DatabasePanel
                    onImport={(rows) => {
                      setItems((prev) => [...prev, ...rows]);
                      setTab("upload");
                    }}
                  />
                )}
                {tab === "sample" && (
                  <div className="rounded-xl border border-line bg-subtle p-6">
                    <span className="mb-3 grid size-9 place-items-center rounded-md border border-line-strong bg-elevated">
                      <Sparkles className="size-4" />
                    </span>
                    <p className="text-[15px] font-medium">Staff leave policy</p>
                    <p className="mt-1 max-w-md text-[13px] text-muted">
                      Twelve short documents about annual leave: a policy, a handbook, an FAQ, a budget paper and more.
                      Several repeat the same figure. A new policy update is waiting for the next step. Good for a
                      first walkthrough.
                    </p>
                    <button
                      type="button"
                      onClick={addSample}
                      className="mt-4 rounded-md bg-fg px-3.5 py-2 text-[13px] font-medium text-bg transition hover:bg-white active:scale-[0.97]"
                    >
                      Add the sample set
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <AnimatePresence>
              {notice && (
                <motion.p
                  key="notice"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-3 rounded-md border border-line bg-elevated px-3 py-2 text-[12.5px] text-muted"
                >
                  {notice}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="mt-6">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-[13px] font-medium text-muted">
                  {items.length === 0 ? "Nothing added yet" : `${items.length} item${items.length > 1 ? "s" : ""}`}
                </h2>
              </div>

              {items.length === 0 ? (
                <p className="rounded-xl border border-line bg-subtle px-5 py-8 text-center text-[13px] text-faint">
                  {loaded ? "Files you add will appear here with their fingerprint." : "Checking for earlier uploads…"}
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

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            <SummaryPanel
              items={items}
              collection={collection}
              onCollectionChange={setCollection}
              onClear={clearAll}
              onStart={startInvestigation}
            />
          </motion.div>
        </div>
      </main>
    </div>
  );
}
