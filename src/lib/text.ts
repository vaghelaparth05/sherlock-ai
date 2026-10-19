import mammoth from "mammoth";

export const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "html", "htm", "eml", "rtf"]);

export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripRtf(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'[0-9a-f]{2}/gi, "")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .trim();
}

/**
 * Best-effort plain text for a stored file. Returns null for formats that need the AI
 * scanner to read them directly (PDF) so the UI can say so instead of showing nothing.
 */
export async function extractText(bytes: Buffer, ext: string): Promise<string | null> {
  const e = ext.toLowerCase();
  if (e === "html" || e === "htm") return stripHtml(bytes.toString("utf8"));
  if (e === "rtf") return stripRtf(bytes.toString("utf8"));
  if (TEXT_EXTENSIONS.has(e)) return bytes.toString("utf8");
  if (e === "docx") {
    try {
      const out = await mammoth.extractRawText({ buffer: bytes });
      return out.value.trim() || null;
    } catch {
      return null;
    }
  }
  return null;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, fifty: 50, seventy: 70, hundred: 100,
};

export function numberFromToken(token: string): number | null {
  const t = token.toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  return NUMBER_WORDS[t] ?? null;
}

export const NUMBER_TOKEN = `(?:\\d+|${Object.keys(NUMBER_WORDS).join("|")})`;
