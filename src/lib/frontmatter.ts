/**
 * Reads the small metadata block some records start with:
 *
 *   ---
 *   id: D02
 *   series: grant_guidelines
 *   version: 2
 *   record_status: declared
 *   in_ai_scope: true
 *   ---
 *
 * This is read by code, not by the AI, so these fields are always exact.
 */

export interface FrontMatter {
  id?: string;
  title?: string;
  series?: string;
  version?: number;
  unit?: string;
  creator?: string;
  function?: string;
  custody?: string[];
  recordStatus?: string;
  date?: string;
  reviewDate?: string;
  inAiScope?: boolean;
  cites?: string[];
}

const unquote = (v: string) => v.trim().replace(/^["']|["']$/g, "");
const list = (v: string) =>
  v
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map(unquote)
    .filter(Boolean);

const BLOCK = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function parseFrontMatter(text: string | null | undefined): FrontMatter | null {
  if (!text) return null;
  const m = text.match(BLOCK);
  if (!m) return null;
  const raw: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (kv) raw[kv[1].toLowerCase()] = kv[2].trim();
  }
  const fm: FrontMatter = {};
  if (raw.id) fm.id = unquote(raw.id);
  if (raw.title) fm.title = unquote(raw.title);
  if (raw.series) fm.series = unquote(raw.series);
  if (raw.version && /^\d+$/.test(unquote(raw.version))) fm.version = Number(unquote(raw.version));
  if (raw.unit) fm.unit = unquote(raw.unit);
  if (raw.creator) fm.creator = unquote(raw.creator);
  if (raw.function) fm.function = unquote(raw.function);
  if (raw.custody) fm.custody = list(raw.custody);
  if (raw.record_status) fm.recordStatus = unquote(raw.record_status).toLowerCase();
  if (raw.date && /^\d{4}-\d{2}-\d{2}$/.test(unquote(raw.date))) fm.date = unquote(raw.date);
  if (raw.review_date) fm.reviewDate = unquote(raw.review_date);
  if (raw.in_ai_scope) fm.inAiScope = /^(true|yes|1)$/i.test(unquote(raw.in_ai_scope));
  if (raw.cites) fm.cites = list(raw.cites);
  return Object.keys(fm).length ? fm : null;
}

/** The document text without its front matter block. */
export function stripFrontMatter(text: string): string {
  return text.replace(BLOCK, "");
}
