import "server-only";
import { cookies } from "next/headers";

/**
 * Mock auth for the demo: a cookie holds the session, nothing is signed or hashed.
 * Good enough to demonstrate the two-role flow (normal user vs information manager);
 * swap for real sessions (and real password hashing) before this goes anywhere real.
 */

export type Role = "user" | "manager";

export interface SessionUser {
  name: string;
  email: string;
  role: Role;
}

const COOKIE_NAME = "sherlock_session";

export async function createSession(user: SessionUser): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, JSON.stringify(user), {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SessionUser>;
    if (!parsed.email || (parsed.role !== "user" && parsed.role !== "manager")) return null;
    return { name: parsed.name ?? "", email: parsed.email, role: parsed.role };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export { COOKIE_NAME };
