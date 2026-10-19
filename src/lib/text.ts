import { extractText as pdfText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

/**
 * Text renditions of uploaded originals. The original bytes are never changed; this text is
 * what claims are extracted from and what every quote is checked against.
 */

export class NeedsOcr extends Error {}
export class Unsupported extends Error {}

export const TEXT_FORMATS = ["md", "txt", "html", "htm", "eml", "pdf", "docx"] as const;
export const IMAGE_FORMATS = ["png", "jpg", "jpeg", "tif", "tiff", "heic"] as const;
export const ACCEPTED_FORMATS: readonly string[] = [...TEXT_FORMATS, ...IMAGE_FORMATS];

const tidy = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e.toLowerCase()] ?? m),
  );

export function htmlToText(html: string): string {
  return tidy(
    decodeEntities(
      html
        .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote)>/gi, "\n\n")
        .replace(/<[^>]+>/g, ""),
    ),
  );
}

function decodePart(body: string, encoding: string | undefined): string {
  const enc = (encoding ?? "").toLowerCase();
  if (enc === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
  if (enc === "quoted-printable") {
    const bytes = body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
    return Buffer.from(bytes, "latin1").toString("utf8");
  }
  return body;
}

function parseHeaders(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block.replace(/\r\n?/g, "\n").replace(/\n[ \t]+/g, " ").split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return out;
}

// ponytail: handles plain and multipart/alternative emails; nested multiparts and attachments are skipped.
export function emailToText(raw: string): string {
  const split = raw.search(/\r?\n\r?\n/);
  const headers = parseHeaders(split === -1 ? raw : raw.slice(0, split));
  let body = split === -1 ? "" : raw.slice(split).trim();
  const boundary = headers["content-type"]?.match(/boundary="?([^";]+)"?/i)?.[1];
  if (boundary) {
    const parts = body.split(`--${boundary}`).map((p) => {
      const s = p.search(/\r?\n\r?\n/);
      return { h: parseHeaders(s === -1 ? p : p.slice(0, s)), b: s === -1 ? "" : p.slice(s).trim() };
    });
    const plain = parts.find((p) => /text\/plain/i.test(p.h["content-type"] ?? ""));
    const html = parts.find((p) => /text\/html/i.test(p.h["content-type"] ?? ""));
    const part = plain ?? html;
    body = part ? decodePart(part.b, part.h["content-transfer-encoding"]) : "";
    if (!plain && html) body = htmlToText(body);
  } else {
    body = decodePart(body, headers["content-transfer-encoding"]);
    if (/text\/html/i.test(headers["content-type"] ?? "")) body = htmlToText(body);
  }
  const head = ["from", "to", "date", "subject"].filter((k) => headers[k]).map((k) => `${k[0].toUpperCase()}${k.slice(1)}: ${headers[k]}`);
  return tidy(`${head.join("\n")}\n\n${body}`);
}

/** Returns the text rendition and how it was made. Throws NeedsOcr when there is no text layer. */
export async function textOf(bytes: Uint8Array, ext: string): Promise<{ text: string; method: string }> {
  const e = ext.toLowerCase();
  if ((IMAGE_FORMATS as readonly string[]).includes(e)) throw new NeedsOcr("Image with no text layer.");
  if (e === "md" || e === "txt") return { text: tidy(Buffer.from(bytes).toString("utf8")), method: "utf-8 text" };
  if (e === "html" || e === "htm") return { text: htmlToText(Buffer.from(bytes).toString("utf8")), method: "html to text" };
  if (e === "eml") return { text: emailToText(Buffer.from(bytes).toString("utf8")), method: "email body" };
  if (e === "docx") {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return { text: tidy(value), method: "docx text (mammoth)" };
  }
  if (e === "pdf") {
    const { totalPages, text } = await pdfText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: false });
    const joined = tidy(text.join("\n\n"));
    // ponytail: a page needs ~20 visible characters to count as having a text layer; tune if real scans slip through.
    if (joined.replace(/\s/g, "").length < 20 * totalPages) throw new NeedsOcr("PDF has no text layer.");
    return { text: joined, method: `pdf text layer (${totalPages} page${totalPages > 1 ? "s" : ""})` };
  }
  throw new Unsupported(`.${e || "unknown"} files are not supported. Use PDF, Word (.docx), HTML, email (.eml), text or Markdown.`);
}
