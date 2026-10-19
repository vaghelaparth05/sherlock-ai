"use client";

import { useRef, useState } from "react";
import { BellRing, CloudUpload, FileCheck2 } from "lucide-react";
import clsx from "clsx";
import { TopNav } from "@/components/top-nav";
import { Reveal } from "@/components/reveal";
import { ProvenanceFields, EMPTY_PROVENANCE, type Provenance } from "@/components/provenance-fields";
import { useApi, useRequireUser } from "@/components/live-provider";
import { ACCEPT_ATTR } from "@/lib/format";

interface Mine { id: string; title: string; submittedAt: string; review: string; aiReadable: boolean }
interface Notice { id: string; answerId: string; question: string | null; reason: string; createdAt: string }

const STATUS: Record<string, string> = {
  awaiting: "Waiting for the information manager",
  approved: "Approved",
  rejected: "Not approved",
  not_required: "Recorded",
};

/** A staff member submits a record with its provenance, and sees where each submission stands. */
export function SubmitView() {
  const user = useRequireUser();
  const mine = useApi<{ mine?: Mine[]; awaiting?: unknown }>(user ? "/api/submissions" : null);
  const notices = useApi<{ notices: Notice[] }>(user ? "/api/recalls" : null);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(""); // blank means today, filled in on submit
  const [provenance, setProvenance] = useState<Provenance>({ ...EMPTY_PROVENANCE, custody: "external,team_site", record_status: "unknown" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const markdown = file?.name.toLowerCase().endsWith(".md");

  async function submit() {
    if (!file) return;
    if (!markdown && !provenance.function) return setMessage({ ok: false, text: "Choose the business function." });
    setBusy(true);
    setMessage(null);
    const form = new FormData();
    form.append("file", file);
    if (!markdown) {
      form.append("title", title || file.name.replace(/\.[^.]+$/, ""));
      form.append("date", date || new Date().toISOString().slice(0, 10));
      for (const [k, v] of Object.entries(provenance)) form.append(k, v);
    }
    try {
      const res = await fetch("/api/register/ingest", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed.");
      setMessage({ ok: true, text: `${body.document.id} received and checked. ${user?.role === "contributor" ? "The information manager will review it before the assistant can read it." : ""}` });
      setFile(null);
      setTitle("");
      mine.reload();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen">
      <TopNav current="submit" />
      <main className="mx-auto grid max-w-5xl gap-6 px-5 pb-24 pt-10 lg:grid-cols-[1fr_320px]">
        <section>
          <Reveal>
            <h1 className="text-3xl font-semibold tracking-tight">Submit a record</h1>
            <p className="mt-2 text-[14px] text-muted">
              Found a document callers are asking about? Upload it here. Sherlock fingerprints the original, checks where it came from, and the
              information manager decides whether the assistant may use it.
            </p>
          </Reveal>
          <div className="mt-6 space-y-4 rounded-xl border border-line bg-subtle p-5">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className={clsx("flex w-full items-center gap-3 rounded-lg border border-dashed px-4 py-5 text-left transition", file ? "border-accent bg-accent-soft" : "border-line-strong hover:border-muted")}
            >
              {file ? <FileCheck2 className="size-5 text-accent" /> : <CloudUpload className="size-5 text-muted" />}
              <span>
                <span className="block text-[14px] font-medium">{file ? file.name : "Choose a file"}</span>
                <span className="block text-[12px] text-muted">PDF, Word, HTML, email, text or Markdown. Scans and photos are kept for OCR.</span>
              </span>
            </button>
            <input ref={input} type="file" accept={ACCEPT_ATTR} className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file && !markdown && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-[12px] text-muted">
                    Title
                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={file.name.replace(/\.[^.]+$/, "")} className="mt-1.5 w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-[13px] outline-none focus:border-accent" />
                  </label>
                  <label className="text-[12px] text-muted">
                    Date on the document
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5 w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-[13px] outline-none focus:border-accent" />
                  </label>
                </div>
                <ProvenanceFields value={provenance} onChange={setProvenance} />
              </>
            )}
            {markdown && <p className="text-[12px] text-muted">This Markdown record carries its own provenance in its front matter.</p>}
            <button type="button" disabled={!file || busy} onClick={submit} className="rounded-md bg-fg px-4 py-2.5 text-[13px] font-medium text-bg transition hover:opacity-85 disabled:opacity-35">
              {busy ? "Checking…" : "Submit for review"}
            </button>
            {message && <p className={clsx("text-[12.5px]", message.ok ? "text-success" : "text-danger")}>{message.text}</p>}
          </div>
        </section>

        <aside className="space-y-4 pt-1">
          <div>
            <p className="mb-2 text-[12px] font-medium text-muted">Your submissions</p>
            <ul className="overflow-hidden rounded-xl border border-line bg-subtle">
              {(mine.data?.mine ?? []).map((m) => (
                <li key={m.id} className="border-b border-line px-3.5 py-3 last:border-b-0">
                  <p className="truncate text-[13px] font-medium">{m.title}</p>
                  <p className={clsx("text-[11.5px]", m.review === "approved" ? "text-success" : m.review === "rejected" ? "text-danger" : "text-muted")}>
                    {m.id} · {STATUS[m.review] ?? m.review}{m.review === "approved" && !m.aiReadable ? " (held by the gate)" : ""}
                  </p>
                </li>
              ))}
              {!(mine.data?.mine ?? []).length && <li className="px-3.5 py-4 text-[12.5px] text-faint">Nothing submitted yet.</li>}
            </ul>
          </div>
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted"><BellRing className="size-3.5" /> Recall notices</p>
            <ul className="space-y-2">
              {(notices.data?.notices ?? []).map((n) => (
                <li key={n.id} className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-3 text-[12px]">
                  <p className="font-medium text-danger">Answer {n.answerId} needs correcting</p>
                  {n.question && <p className="mt-0.5 text-fg">You asked: “{n.question}”</p>}
                  <p className="mt-1 text-muted">{n.reason}</p>
                  <p className="mt-1 text-faint">Please contact the applicant with the updated information.</p>
                </li>
              ))}
              {!(notices.data?.notices ?? []).length && <li className="rounded-xl border border-line bg-subtle px-3.5 py-4 text-[12.5px] text-faint">No recall notices.</li>}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
