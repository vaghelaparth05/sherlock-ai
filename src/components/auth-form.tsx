"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search, ArrowRight } from "lucide-react";
import { signupAction, loginAction, type AuthState } from "@/app/actions/auth";

const INITIAL: AuthState = {};

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const [state, formAction, pending] = useActionState(isSignup ? signupAction : loginAction, INITIAL);
  const params = useSearchParams();
  const next = params.get("next");

  return (
    <div className="grid min-h-screen place-items-center px-5 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-md border border-line-strong bg-elevated">
            <Search className="size-3.5 text-fg" strokeWidth={2.25} />
          </span>
          <span className="text-sm font-semibold tracking-tight">Sherlock.ai</span>
        </Link>

        <div className="rounded-xl border border-line bg-subtle p-6">
          <h1 className="text-xl font-semibold tracking-tight">
            {isSignup ? "Create an account" : "Log in"}
          </h1>
          <p className="mt-1.5 text-[13px] text-muted">
            {next === "/status"
              ? "Sign in to see the review status for your documents."
              : isSignup
                ? "Create an account to track the review of your documents."
                : "Welcome back."}
          </p>

          <form action={formAction} className="mt-5 space-y-3.5">
            {isSignup && (
              <div>
                <label className="text-[12px] text-muted" htmlFor="name">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  required
                  placeholder="Jordan Smith"
                  className="mt-1.5 w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-[13.5px] outline-none transition placeholder:text-faint focus:border-accent"
                />
              </div>
            )}

            <div>
              <label className="text-[12px] text-muted" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className="mt-1.5 w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-[13.5px] outline-none transition placeholder:text-faint focus:border-accent"
              />
            </div>

            <div>
              <label className="text-[12px] text-muted" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                className="mt-1.5 w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-[13.5px] outline-none transition placeholder:text-faint focus:border-accent"
              />
              <p className="mt-1.5 text-[11px] text-faint">Demo auth: any password works once you have an account.</p>
            </div>

            {state.error && (
              <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="group flex w-full items-center justify-center gap-2 rounded-md bg-fg px-4 py-2.5 text-[13.5px] font-medium text-bg transition hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "One moment…" : isSignup ? "Create account" : "Log in"}
              {!pending && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-[13px] text-muted">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="text-fg underline underline-offset-2">
                Log in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link href="/signup" className="text-fg underline underline-offset-2">
                Create an account
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
