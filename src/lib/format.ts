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

export const ACCEPT_ATTR = ".pdf,.docx,.txt,.md,.html,.htm,.eml,.png,.jpg,.jpeg,.tif,.tiff,.heic";

/** Mirrors data/corpus, which `npm run seed` loads into the register. */
export const SAMPLE_COLLECTION: Omit<ImportItem, "id" | "status" | "progress" | "origin">[] = [
  { name: "D01 Riverbend Flood Recovery Grant Guidelines v1.md", size: 1800, ext: "md" },
  { name: "D02 Riverbend Flood Recovery Grant Guidelines v2.md", size: 1780, ext: "md" },
  { name: "D03 Call centre script (March).md", size: 1537, ext: "md" },
  { name: "D04 Staff intranet FAQ.md", size: 1585, ext: "md" },
  { name: "D05 Training slides: grant basics.md", size: 1562, ext: "md" },
  { name: "D06 Minister's media release.md", size: 1511, ext: "md" },
  { name: "D07 Eligibility quick reference card.md", size: 1315, ext: "md" },
  { name: "D08 Payments procedure.md", size: 1832, ext: "md" },
  { name: "D09 AI-generated staff FAQ summary.md", size: 1568, ext: "md" },
  { name: "D10 Proof of address procedure.md", size: 1537, ext: "md" },
  { name: "D11 Call centre script v2.md", size: 1623, ext: "md" },
  { name: "D12 Remote community applications procedure.md", size: 1809, ext: "md" },
  { name: "D13 Email: remote applicants turned away.md", size: 1511, ext: "md" },
  { name: "D15 Internal audit memo: grant controls.md", size: 1879, ext: "md" },
  { name: "D16 Executive board briefing.md", size: 1580, ext: "md" },
  { name: "D17 Community newsletter article.md", size: 1468, ext: "md" },
  { name: "D18 Grants steering committee minutes.md", size: 1726, ext: "md" },
  { name: "D19 Staff newsletter.md", size: 1462, ext: "md" },
  { name: "D20 Field visit report.md", size: 1656, ext: "md" },
].map((d) => ({ ...d, detail: "Sample set" }));
