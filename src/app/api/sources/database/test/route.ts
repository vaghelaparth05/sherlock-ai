/**
 * PLACEHOLDER. Does not open a real database connection yet.
 * It validates the connection string shape and returns sample tables so the
 * import UI can be built and demoed. Replace with a real driver (pg, mysql2,
 * better-sqlite3) plus a read-only credential before connecting anything real.
 */

const SAMPLE_TABLES = [
  { name: "policy_documents", rows: 1284, columns: ["id", "title", "body", "owner", "effective_date"] },
  { name: "meeting_minutes", rows: 640, columns: ["id", "meeting_date", "attendees", "notes"] },
  { name: "correspondence", rows: 3920, columns: ["id", "sender", "recipient", "subject", "body", "sent_at"] },
  { name: "audit_findings", rows: 212, columns: ["id", "report_id", "finding", "severity"] },
];

const PATTERN = /^(postgres(ql)?|mysql|sqlite|mssql):\/\/.+/i;

export async function POST(request: Request) {
  let body: { connectionString?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }
  const cs = typeof body.connectionString === "string" ? body.connectionString.trim() : "";
  if (!PATTERN.test(cs)) {
    return Response.json(
      { error: "That does not look like a connection string. Example: postgres://user:pass@host:5432/db" },
      { status: 400 },
    );
  }
  // Simulate network latency so the UI's loading state is exercised.
  await new Promise((r) => setTimeout(r, 900));
  return Response.json({ ok: true, mocked: true, tables: SAMPLE_TABLES });
}
