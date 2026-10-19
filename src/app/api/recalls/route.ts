import { connection } from "next/server";
import { allAnswers, recallNotices } from "@/lib/impact";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

/** Information manager: every recall notice. Staff: the notices addressed to them. */
export async function GET() {
  await connection();
  try {
    const user = await requireUser();
    const answers = new Map(allAnswers().map((a) => [a.id, a]));
    const notices = recallNotices()
      .filter((n) => user.role === "information_manager" || n.staffId === user.name)
      .map((n) => ({ ...n, question: answers.get(n.answerId)?.question ?? null }));
    return Response.json({ notices });
  } catch (e) {
    return errorResponse(e);
  }
}
