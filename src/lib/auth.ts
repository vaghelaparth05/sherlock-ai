import { cookies } from "next/headers";
import { COOKIE, userFromToken, type Role, type User } from "./session.ts";

/** Route-handler helpers. Throws a Response so handlers can `catch (e) { if (e instanceof Response) return e }`. */

export async function currentUser(): Promise<User | null> {
  return userFromToken((await cookies()).get(COOKIE)?.value);
}

export async function requireUser(...roles: Role[]): Promise<User> {
  const user = await currentUser();
  if (!user) throw Response.json({ error: "Sign in first." }, { status: 401 });
  if (roles.length && !roles.includes(user.role)) {
    throw Response.json({ error: "Only the information manager can do this." }, { status: 403 });
  }
  return user;
}
