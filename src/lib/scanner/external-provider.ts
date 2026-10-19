import { ExtractedDocSchema, type AssistInput, type Assistance, type DocInput, type ScanProvider } from "@/lib/scanner/types";
import { rulesProvider } from "@/lib/scanner/rules-provider";

/**
 * Bridge to a scanner running as a separate service (for example the team's Python scanner).
 * Set SHERLOCK_SCANNER=external and SCANNER_URL=http://localhost:8000/extract
 *
 * Sherlock POSTs JSON:  { name, ext, sha256, text, base64 }   (text is null for formats like PDF)
 * The service replies with JSON in the ExtractedDoc shape (see src/lib/scanner/types.ts and README.md).
 * Comparing claims, source tracing, integrity checks and the audit log stay in Sherlock.
 */
export const scannerUrl = () => process.env.SCANNER_URL?.trim() || "";

export function externalProvider(): ScanProvider {
  return {
    id: "external",
    label: "External scanner",
    model: scannerUrl() || null,
    paceMs: 0,

    async extract(doc: DocInput) {
      const url = scannerUrl();
      if (!url) throw new Error("SCANNER_URL is not set.");
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: doc.name, ext: doc.ext, sha256: doc.sha256, text: doc.text, base64: doc.bytes.toString("base64") }),
          signal: AbortSignal.timeout(120_000),
        });
      } catch {
        throw new Error(`Could not reach the external scanner at ${url}. Is it running?`);
      }
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 200);
        throw new Error(`The external scanner returned ${res.status}${detail ? `: ${detail}` : ""}`);
      }
      const parsed = ExtractedDocSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new Error(`The external scanner's reply did not match the expected shape: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
      return parsed.data;
    },

    async review() {
      return null;
    },

    // Recommendations on the review screen fall back to the offline rules.
    assist(input: AssistInput): Promise<Assistance> {
      return rulesProvider.assist(input);
    },
  };
}
