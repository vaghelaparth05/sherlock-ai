import { KIND_LABEL, TYPE_META } from "@/lib/meta";
import { docLookup } from "@/lib/results-derive";
import type { ResultsPayload } from "@/lib/types";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Findings as a CSV a records team can open in Excel. */
export function findingsCsv(data: ResultsPayload): string {
  const doc = docLookup(data.docs);
  const rows = [
    ["Type", "Kind", "Severity", "Confidence %", "Status", "Title", "Summary", "Documents", "Decision note", "Decided at"],
    ...data.findings.map((f) => [
      TYPE_META[f.type].label,
      KIND_LABEL[f.kind],
      f.severity,
      f.confidence,
      f.status,
      f.title,
      f.summary,
      f.docIds.map((id) => doc(id)?.title ?? id).join("; "),
      f.note ?? "",
      f.decidedAt ?? "",
    ]),
  ];
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

export function download(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
