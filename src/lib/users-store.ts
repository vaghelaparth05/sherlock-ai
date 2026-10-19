import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Role } from "@/lib/auth";

/**
 * Local mock user directory for the demo, written once per signup.
 * Swap for a real database when real auth lands.
 */

const FILE = path.join(process.cwd(), "data", "users.json");

export interface StoredUser {
  name: string;
  email: string;
  role: Role;
}

// Information managers are internal staff, provisioned ahead of time rather than
// self-signing up. Demo stand-in for that provisioning: log in with this email
// (any password — see lib/auth.ts) to get the manager role without ever signing up.
const SEED_MANAGERS: StoredUser[] = [
  { name: "Information Manager", email: "manager@sherlock.ai", role: "manager" },
  { name: "Manager Dev", email: "managerdev@gmail.com", role: "manager" },
];

async function readAll(): Promise<StoredUser[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as StoredUser[];
  } catch {
    return [];
  }
}

async function writeAll(users: StoredUser[]): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(users, null, 2));
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const lower = email.toLowerCase();
  const seeded = SEED_MANAGERS.find((u) => u.email.toLowerCase() === lower);
  if (seeded) return seeded;
  const users = await readAll();
  return users.find((u) => u.email.toLowerCase() === lower) ?? null;
}

export async function createUser(user: StoredUser): Promise<StoredUser> {
  const users = await readAll();
  users.push(user);
  await writeAll(users);
  return user;
}
