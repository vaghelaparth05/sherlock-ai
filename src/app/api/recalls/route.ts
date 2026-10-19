import { connection } from "next/server";
import { allAnswers, recallNotices } from "@/lib/impact";

export async function GET() {
  await connection();
  const answers = new Map(allAnswers().map((a) => [a.id, a]));
  return Response.json({
    notices: recallNotices().map((n) => ({ ...n, question: answers.get(n.answerId)?.question ?? null })),
  });
}
