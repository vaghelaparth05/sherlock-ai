/** Small helpers so every route returns errors the same way. */

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function fail(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

/** Wraps a handler so database and unexpected errors become readable JSON instead of a 500 page. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    const err = e as Error & { code?: string };
    console.error("[api]", err);
    if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND" || /password authentication|does not exist.*database/i.test(err.message)) {
      return fail("Cannot reach the database. Start Docker Desktop, then run: docker compose up -d", 503);
    }
    return fail(err.message || "Something went wrong.", 500);
  }
}
