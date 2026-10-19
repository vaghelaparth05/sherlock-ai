import { connection } from "next/server";
import { fail, handle, json } from "@/lib/http";
import { createCollection, listCollections } from "@/lib/repo";

export async function GET() {
  await connection();
  return handle(async () => {
    return json({ collections: await listCollections() });
  });
}

export function POST(request: Request) {
  return handle(async () => {
    const body = (await request.json().catch(() => ({}))) as { name?: unknown; description?: unknown };
    if (typeof body.name !== "string" || !body.name.trim()) return fail("Give the collection a name.");
    return json(await createCollection(body.name, typeof body.description === "string" ? body.description : null), 201);
  });
}
