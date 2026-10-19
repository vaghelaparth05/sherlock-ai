import { fail, handle, json } from "@/lib/http";
import { getFinding, isId } from "@/lib/repo";
import { chooseProvider } from "@/lib/scanner";
import { friendlyGeminiError } from "@/lib/scanner/gemini-provider";

/** Asks the scanner's AI (or the offline rules) what it would recommend for one finding. The human still decides. */
export function POST(_request: Request, ctx: RouteContext<"/api/findings/[id]/assist">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isId(id)) return fail("Invalid finding id.");
    const f = await getFinding(id);
    if (!f) return fail("Finding not found.", 404);
    const provider = chooseProvider();
    try {
      const out = await provider.assist({
        title: f.title,
        summary: f.summary,
        kind: f.kind,
        confidence: f.confidence,
        documents: f.docIds.map((d) => f.docTitles[d] ?? d),
        evidence: f.evidence.map((e) => ({ label: e.label, doc: e.docId ? f.docTitles[e.docId] : undefined, quote: e.quote.replace(/\[\[|\]\]/g, "") })),
      });
      return json({ ...out, provider: provider.id, model: provider.model });
    } catch (e) {
      return fail(provider.id === "gemini" ? friendlyGeminiError(e) : (e as Error).message, 502);
    }
  });
}
