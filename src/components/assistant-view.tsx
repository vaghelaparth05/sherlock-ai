"use client";

import { useState } from "react";
import { MessageSquareText, Send } from "lucide-react";
import { TopNav } from "@/components/top-nav";
import { Reveal } from "@/components/reveal";
import { postJson, useApi, useRequireUser } from "@/components/live-provider";
import type { ask } from "@/lib/assistant";

type Answer = Awaited<ReturnType<typeof ask>>;
interface Past { id: string; askedAt: string; question: string; sentences: { text: string; label?: string }[] }

const SUGGESTED = ["Are renters eligible for the grant?", "When do applications close?", "Is there a fee to apply?", "What proof of address can a remote applicant give?"];

/** The staff assistant: answers only from records the information manager has allowed, with a trust label per sentence. */
export function AssistantView() {
  const user = useRequireUser();
  const history = useApi<{ answers: Past[] }>(user ? "/api/assistant" : null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(q: string) {
    if (!q.trim()) return;
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      setAnswer(await postJson<Answer>("/api/assistant", { question: q.trim() }));
      history.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The assistant could not answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen">
      <TopNav current="assistant" />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-10">
        <Reveal>
          <h1 className="text-3xl font-semibold tracking-tight">Grant assistant</h1>
          <p className="mt-2 text-[14px] text-muted">
            Answers come only from records the information manager has approved and Sherlock allows. Every sentence shows its trust score and how many
            independent sources agree. Anything it cannot cite is removed.
          </p>
        </Reveal>

        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(question);
          }}
        >
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about the flood recovery grant…" className="flex-1 rounded-lg border border-line-strong bg-subtle px-3.5 py-2.5 text-[14px] outline-none focus:border-accent" />
          <button type="submit" disabled={busy || !question.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-fg px-4 text-[13px] font-medium text-bg disabled:opacity-35">
            <Send className="size-4" /> {busy ? "Checking records…" : "Ask"}
          </button>
        </form>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGGESTED.map((q) => (
            <button key={q} type="button" onClick={() => { setQuestion(q); send(q); }} className="rounded-full border border-line px-3 py-1 text-[12px] text-muted transition hover:text-fg">{q}</button>
          ))}
        </div>

        {error && <p className="mt-4 text-[13px] text-danger">{error}</p>}
        {answer && (
          <section className="mt-6 rounded-xl border border-line-strong bg-subtle p-5" aria-live="polite">
            <p className="text-[12px] text-faint">{answer.id ? `Answer ${answer.id} · logged for recall` : "Not logged"}</p>
            <h2 className="mt-1 text-[15px] font-medium">{answer.question}</h2>
            {answer.answered ? (
              <ul className="mt-3 space-y-3">
                {answer.sentences.map((s, i) => (
                  <li key={i}>
                    <p className="text-[14px] leading-relaxed">{s.text}</p>
                    <p className="mt-1 text-[11.5px] text-muted">
                      <span className={s.trust >= 80 ? "text-success" : s.trust >= 60 ? "text-warning" : "text-danger"}>{s.label}</span>
                      {" · "}
                      {s.sources.map((d) => `${d.documentId} ${d.documentTitle}`).join("; ")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[14px] text-muted">{answer.note}</p>
            )}
            {answer.removed.length > 0 && (
              <p className="mt-3 border-t border-line pt-2 text-[12px] text-faint">
                {answer.removed.length} sentence{answer.removed.length > 1 ? "s" : ""} removed: unsupported by any allowed record.
              </p>
            )}
          </section>
        )}

        {(history.data?.answers ?? []).length > 0 && (
          <section className="mt-10">
            <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted"><MessageSquareText className="size-3.5" /> Earlier answers</h2>
            <ul className="divide-y divide-line rounded-xl border border-line bg-subtle">
              {history.data!.answers.slice(0, 8).map((a) => (
                <li key={a.id} className="px-4 py-3 text-[12.5px]">
                  <p className="font-medium">{a.question} <span className="font-normal text-faint">· {a.id}</span></p>
                  <p className="mt-0.5 text-muted">{a.sentences.map((s) => s.text).join(" ")}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
