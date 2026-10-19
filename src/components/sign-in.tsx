"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLive } from "@/components/live-provider";

interface Account {
  id: string;
  name: string;
  role: "information_manager" | "contributor";
  title: string;
}

/** Demo sign-in: pick an account. In a real deployment this is the agency's own sign-in. */
export function SignIn() {
  const router = useRouter();
  const { reloadSession } = useLive();
  const [users, setUsers] = useState<Account[]>([]);
  const [current, setCurrent] = useState<Account | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((d) => {
        setUsers(d.users);
        setCurrent(d.user);
      })
      .catch(() => setError("Could not reach Sherlock."));
  }, []);

  async function signIn(u: Account) {
    const res = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: u.id }) });
    if (!res.ok) return setError("Could not sign in.");
    await reloadSession();
    const next = new URLSearchParams(window.location.search).get("next");
    const home = u.role === "information_manager" ? "/dashboard" : "/submit";
    router.push(next && next.startsWith("/") && (u.role === "information_manager" || ["/submit", "/assistant"].includes(next)) ? next : home);
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-md place-items-center px-5">
      <div className="w-full">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to Sherlock</h1>
        <p className="mt-2 text-[13.5px] text-muted">
          Demo accounts. {current ? `Signed in as ${current.name}.` : "Choose who you are."}
        </p>
        <ul className="mt-6 grid gap-2">
          {users.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => signIn(u)}
                className="w-full rounded-xl border border-line bg-subtle px-4 py-3 text-left transition hover:border-muted"
              >
                <span className="block text-[14px] font-medium">{u.name}</span>
                <span className="block text-[12.5px] text-muted">
                  {u.title} · {u.role === "information_manager" ? "reviews and approves records" : "uploads records for review"}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {error && <p className="mt-3 text-[12.5px] text-danger">{error}</p>}
      </div>
    </main>
  );
}
