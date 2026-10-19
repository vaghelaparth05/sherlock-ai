import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";

/**
 * Demo sign-in: two accounts from data/users.yaml, no passwords. The session cookie is
 * signed so the role cannot be edited in the browser, and the server checks it on every route.
 */

export type Role = "information_manager" | "contributor";

export interface User {
  id: string;
  name: string;
  role: Role;
  title: string;
  unit?: string;
}

export const COOKIE = "sherlock_session";

let users: User[] | undefined;
export function allUsers(): User[] {
  if (!users) {
    const raw = YAML.parse(readFileSync(path.join(process.cwd(), "data", "users.yaml"), "utf8")) as {
      users: Record<string, Omit<User, "id">>;
    };
    users = Object.entries(raw.users).map(([id, u]) => ({ id, ...u }));
  }
  return users;
}

let secret: Buffer | undefined;
function key(): Buffer {
  if (secret) return secret;
  if (process.env.SHERLOCK_SESSION_SECRET) return (secret = Buffer.from(process.env.SHERLOCK_SESSION_SECRET));
  const file = path.join(process.cwd(), "data", "session.key");
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, randomBytes(32).toString("hex"), { flag: "wx" });
  }
  return (secret = Buffer.from(readFileSync(file, "utf8").trim()));
}

const sign = (id: string) => createHmac("sha256", key()).update(id).digest("hex");

export function sessionToken(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function userFromToken(token: string | undefined): User | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  const id = token.slice(0, dot);
  const mac = Buffer.from(token.slice(dot + 1), "hex");
  const want = Buffer.from(sign(id), "hex");
  if (mac.length !== want.length || !timingSafeEqual(mac, want)) return null;
  return allUsers().find((u) => u.id === id) ?? null;
}

/** How a user appears in the ledger. */
export const actorOf = (u: User) => `${u.name} (${u.role === "information_manager" ? "information manager" : "contributor"})`;
