import { connection, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import type { LedgerEntry } from "@/lib/ledger";
import { requireUser } from "@/lib/auth";
import { actorOf } from "@/lib/session";

/**
 * Live updates as Server-Sent Events: every new ledger entry, as it is written.
 * The information manager sees everything. A contributor sees decisions on their own
 * submissions and recall notices addressed to them, without scores or payloads.
 * Resumes from Last-Event-ID (or ?after=<seq>, or ?after=now); sends `event: reset` if the register was re-seeded.
 */
export async function GET(request: NextRequest) {
  await connection();
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return e as Response;
  }
  const manager = user.role === "information_manager";
  const me = actorOf(user);
  const after = request.headers.get("last-event-id") ?? request.nextUrl.searchParams.get("after");
  // ?after=now starts from the latest entry instead of replaying the ledger.
  let last = after === "now" ? ((db().prepare("SELECT MAX(seq) AS m FROM ledger").get() as { m: number | null }).m ?? 0) : Number(after ?? 0) || 0;
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => !closed && controller.enqueue(encoder.encode(s));
      const mine = () =>
        new Set(
          (db().prepare("SELECT target_id, payload_json FROM ledger WHERE action = 'INGEST'").all() as { target_id: string; payload_json: string }[])
            .filter((r) => JSON.parse(r.payload_json).submitted_by === me)
            .map((r) => r.target_id),
        );
      const tick = () => {
        const max = (db().prepare("SELECT MAX(seq) AS m FROM ledger").get() as { m: number | null }).m ?? 0;
        if (max < last) {
          last = 0;
          send("event: reset\ndata: {}\n\n");
        }
        const rows = db().prepare("SELECT * FROM ledger WHERE seq > ? ORDER BY seq").all(last) as unknown as LedgerEntry[];
        const own = manager ? null : mine();
        for (const e of rows) {
          last = e.seq;
          if (manager) {
            send(`id: ${e.seq}\nevent: ledger\ndata: ${JSON.stringify(e)}\n\n`);
            continue;
          }
          const forMe =
            (own!.has(e.target_id) && ["INGEST", "APPROVE", "REJECT"].includes(e.action)) ||
            (e.action === "RECALL_ISSUED" && JSON.parse(e.payload_json).staff_id === user.name);
          if (forMe) {
            const { seq, ts_utc, action, target_id, reason } = e;
            send(`id: ${seq}\nevent: ledger\ndata: ${JSON.stringify({ seq, ts_utc, action, target_id, reason })}\n\n`);
          }
        }
      };
      send("retry: 2000\n\n");
      tick();
      timer = setInterval(() => {
        try {
          tick();
        } catch {
          // the database is being re-seeded; try again next tick
        }
      }, 1000);
      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(timer);
        controller.close();
      });
    },
    cancel() {
      closed = true;
      clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
