/** Small helpers for route handlers: parse a JSON body and read required text fields. */

export class BadRequest extends Error {}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (body && typeof body === "object") return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new BadRequest("Expected a JSON object.");
}

export function text(body: Record<string, unknown>, key: string, opts: { min?: number; max?: number; optional?: boolean } = {}): string {
  const v = typeof body[key] === "string" ? (body[key] as string).trim() : "";
  if (!v && opts.optional) return "";
  if (v.length < (opts.min ?? 1)) throw new BadRequest(`"${key}" needs at least ${opts.min ?? 1} characters.`);
  return v.slice(0, opts.max ?? 1000);
}

/** Maps known errors to 400/409 responses; anything else is a 500. */
export function errorResponse(e: unknown, conflicts: (new (...args: never[]) => Error)[] = []): Response {
  if (e instanceof Response) return e;
  if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
  if (conflicts.some((C) => e instanceof C)) return Response.json({ error: (e as Error).message }, { status: 409 });
  throw e;
}
