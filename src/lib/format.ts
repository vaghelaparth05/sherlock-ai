export type ItemStatus = "uploading" | "ready" | "error";
export type ItemOrigin = "upload";

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

export const ACCEPT_ATTR = ".pdf,.docx,.txt,.md,.csv,.json,.html,.htm,.rtf,.eml";
