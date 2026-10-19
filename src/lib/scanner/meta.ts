import { parseFrontMatter } from "@/lib/frontmatter";
import type { ExtractedDoc } from "@/lib/scanner/types";

/**
 * Records that start with a front-matter block state their own series, version, status and whether
 * the AI may read them. Code reads those exactly, so they always override what any scanner guessed.
 */
export function applyFrontMatter<T extends ExtractedDoc>(ex: T, text: string | null): T {
  const fm = parseFrontMatter(text);
  if (!fm) return ex;
  const status =
    fm.recordStatus === "draft"
      ? "draft"
      : fm.recordStatus === "declared" || fm.recordStatus === "final"
        ? "current"
        : fm.recordStatus === "superseded"
          ? "superseded"
          : fm.recordStatus === "withdrawn"
            ? "withdrawn"
            : ex.status;
  return {
    ...ex,
    title: fm.title ?? ex.title,
    producedBy: fm.unit ?? ex.producedBy,
    date: fm.date ?? ex.date,
    status,
    aiGenerated: ex.aiGenerated || fm.recordStatus === "ai_generated" || undefined,
    frontId: fm.id ?? null,
    series: fm.series ?? null,
    version: fm.version ?? null,
    recordStatus: fm.recordStatus ?? null,
    inAiScope: fm.inAiScope ?? null,
    custody: fm.custody ?? [],
    cites: fm.cites ?? [],
  };
}
