"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { postJson } from "@/lib/client";

interface Assist {
  recommendation: "confirm" | "dismiss" | "needs_human";
  rationale: string;
  suggestedAction: string;
  draftNote: string;
  provider: "gemini" | "rules";
  model: string | null;
}

const REC = {
  confirm: { label: "Recommends confirming", color: "var(--success)" },
  dismiss: { label: "Recommends dismissing", color: "var(--fg-muted)" },
  needs_human: { label: "Needs your judgement", color: "var(--misinfo)" },
} as const;

/** Asks the scanner's AI for a recommendation on one finding. The reviewer still decides. */
export function AssistPanel({ findingId, onUseNote }: { findingId: string; onUseNote: (note: string) => void }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [out, setOut] = useState<Assist | null>(null);
  const [error, setError] = useState("");

  async function ask() {
    setState("loading");
    setError("");
    try {
      setOut(await postJson<Assist>(`/api/findings/${findingId}/assist`, {}));
      setState("done");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }

  return (
    <div className="rounded-xl border border-line bg-subtle p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-[13px] font-medium">
          <Sparkles className="size-4 text-accent" />
          Ask Sherlock
        </p>
        {state !== "loading" && (
          <button
            type="button"
            onClick={ask}
            className="rounded-md border border-line-strong px-3 py-1.5 text-[12.5px] transition hover:bg-hover active:scale-[0.97]"
          >
            {state === "done" ? "Ask again" : "Get a recommendation"}
          </button>
        )}
        {state === "loading" && (
          <span className="inline-flex items-center gap-2 text-[12.5px] text-muted">
            <LoaderCircle className="size-3.5 animate-spin" />
            Thinking
          </span>
        )}
      </div>

      <AnimatePresence mode="wait">
        {state === "error" && (
          <motion.p key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
            {error}
          </motion.p>
        )}
        {state === "done" && out && (
          <motion.div key="d" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 space-y-2.5 text-[13px]">
            <p className="font-medium" style={{ color: REC[out.recommendation].color }}>
              {REC[out.recommendation].label}
            </p>
            <p className="leading-relaxed text-muted">{out.rationale}</p>
            <p className="leading-relaxed">
              <span className="text-faint">Next step: </span>
              {out.suggestedAction}
            </p>
            <div className="flex items-center justify-between gap-3 border-t border-line pt-2.5">
              <span className="text-[11.5px] text-faint">{out.provider === "gemini" ? `Gemini${out.model ? ` · ${out.model}` : ""}` : "Offline rules, not AI"}</span>
              <button type="button" onClick={() => onUseNote(out.draftNote)} className="text-[12.5px] text-muted underline-offset-4 transition hover:text-fg hover:underline">
                Use as note
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
