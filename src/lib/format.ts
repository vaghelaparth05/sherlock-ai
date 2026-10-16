export type ItemStatus = "uploading" | "ready" | "error";
export type ItemOrigin = "upload" | "database" | "sample";

export interface ImportItem {
  /** Client id until the server assigns one; then the server id. */
  id: string;
  name: string;
  size: number;
  ext: string;
  origin: ItemOrigin;
  status: ItemStatus;
  progress: number;
  hash?: string;
  error?: string;
  detail?: string;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

export function shortHash(hash?: string): string {
  return hash ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : "";
}

const GROUPS: Record<string, string> = {
  pdf: "PDF",
  doc: "Word",
  docx: "Word",
  rtf: "Word",
  txt: "Text",
  md: "Text",
  html: "Web",
  htm: "Web",
  eml: "Email",
  csv: "Data",
  xls: "Data",
  xlsx: "Data",
  json: "Data",
  table: "Database",
};

export function groupOf(ext: string): string {
  return GROUPS[ext] ?? "Other";
}

export const ACCEPT_ATTR = ".pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.xls,.json,.html,.htm,.rtf,.eml";

export const SAMPLE_COLLECTION: Omit<ImportItem, "id" | "status" | "progress" | "origin">[] = [
  { name: "Leave Policy v2.pdf", size: 184_320, ext: "pdf" },
  { name: "Staff Handbook 2022.docx", size: 412_160, ext: "docx" },
  { name: "Intranet leave FAQ.html", size: 28_672, ext: "html" },
  { name: "Onboarding pack.pdf", size: 1_240_000, ext: "pdf" },
  { name: "Manager guide.docx", size: 98_304, ext: "docx" },
  { name: "Annual report 2023.pdf", size: 3_800_000, ext: "pdf" },
  { name: "Casual staff guide.pdf", size: 76_800, ext: "pdf" },
  { name: "Payroll manual.docx", size: 530_000, ext: "docx" },
  { name: "Budget paper 2024.xlsx", size: 220_160, ext: "xlsx" },
  { name: "Training slides.pdf", size: 2_100_000, ext: "pdf" },
  { name: "Internal audit report.pdf", size: 960_000, ext: "pdf" },
  { name: "Regional office memo.txt", size: 4_096, ext: "txt" },
].map((d) => ({ ...d, detail: "Sample set" }));
