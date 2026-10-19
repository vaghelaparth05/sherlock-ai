import { cookies } from "next/headers";
import { COOKIE, allUsers, sessionToken } from "@/lib/session";
import { currentUser } from "@/lib/auth";
import { errorResponse, readJson, text } from "@/lib/http";

/** GET: who is signed in, plus the demo accounts. POST {userId}: sign in. DELETE: sign out. */

export async function GET() {
  return Response.json({ user: await currentUser(), users: allUsers() });
}

export async function POST(request: Request) {
  try {
    const id = text(await readJson(request), "userId", { max: 40 });
    const user = allUsers().find((u) => u.id === id);
    if (!user) return Response.json({ error: "No such account." }, { status: 404 });
    (await cookies()).set(COOKIE, sessionToken(user.id), { httpOnly: true, sameSite: "lax", path: "/" });
    return Response.json({ user });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE() {
  (await cookies()).delete(COOKIE);
  return Response.json({ ok: true });
}
