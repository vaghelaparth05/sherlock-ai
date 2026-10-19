"use server";

import { redirect } from "next/navigation";
import { createSession, clearSession } from "@/lib/auth";
import { findUserByEmail, createUser } from "@/lib/users-store";

export interface AuthState {
  error?: string;
}

// Public signup is for normal users only. Information managers are internal
// staff, provisioned ahead of time (see SEED_MANAGERS in users-store.ts) — they log in, they don't sign up.
export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!name || !email) return { error: "Enter your name and email." };
  if (!email.includes("@")) return { error: "Enter a valid email." };

  const existing = await findUserByEmail(email);
  if (existing) return { error: "An account with that email already exists — log in instead." };

  const user = await createUser({ name, email, role: "user" });
  await createSession(user);
  redirect("/status");
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email." };

  const user = await findUserByEmail(email);
  if (!user) return { error: "No account with that email yet — sign up first." };

  await createSession(user);
  redirect(user.role === "manager" ? "/dashboard" : "/status");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}
