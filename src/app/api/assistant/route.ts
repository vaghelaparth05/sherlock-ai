import { connection } from "next/server";
import { answerHistory, ask } from "@/lib/assistant";
import { requireUser } from "@/lib/auth";
import { errorResponse, readJson, text } from "@/lib/http";

/** POST {question}: answer from what the assistant may read, logged for recall. GET: past answers. */

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const question = text(await readJson(request), "question", { min: 3, max: 500 });
    return Response.json(await ask(question, user.name));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Offline mode")) return Response.json({ error: e.message }, { status: 503 });
    return errorResponse(e);
  }
}

export async function GET() {
  await connection();
  try {
    const user = await requireUser();
    return Response.json({ answers: answerHistory(user.role === "information_manager" ? undefined : user.name) });
  } catch (e) {
    return errorResponse(e);
  }
}
