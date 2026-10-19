import type { FindingKind, FindingType } from "@/lib/types";

export const TYPE_META: Record<FindingType, { label: string; color: string; soft: string; blurb: string }> = {
  bias: {
    label: "Bias",
    color: "var(--bias)",
    soft: "var(--bias-soft)",
    blurb: "Sources, viewpoints or language that skew the record",
  },
  misinformation: {
    label: "Misinformation",
    color: "var(--misinfo)",
    soft: "var(--misinfo-soft)",
    blurb: "Claims that are wrong or out of date, shared without intent",
  },
  disinformation: {
    label: "Disinformation",
    color: "var(--disinfo)",
    soft: "var(--disinfo-soft)",
    blurb: "Altered, forged or deliberately misleading content",
  },
};

export const KIND_LABEL: Record<FindingKind, string> = {
  supersedes: "Superseded",
  "depends-on": "Depends on old claim",
  "possible-conflict": "Possible conflict",
  "contradicts-authority": "Contradicts the authority",
  unsourced: "No authority cited",
  "single-source": "Single source",
  representation: "Under-represented",
  echo: "Only repeats others",
  terminology: "Outdated terminology",
  altered: "Altered after registration",
  citation: "Authority not found",
};
