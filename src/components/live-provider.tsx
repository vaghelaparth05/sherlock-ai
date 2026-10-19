"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Finding, dashboard as dashboardOf } from "@/lib/findings";
import type { Claim, SourceDoc } from "@/lib/results-data";
import type { Role, User } from "@/lib/session";

/**
 * Live connection to the backend: who is signed in, the current findings and dashboard numbers,
 * and a `version` that ticks whenever the ledger changes (Server-Sent Events from /api/events).
 */

export interface Results {
  collection: { name: string; scannedAt: string };
  docs: SourceDoc[];
  claims: Claim[];
  findings: Finding[];
}
export type Dashboard = ReturnType<typeof dashboardOf>;

interface Live {
  ready: boolean;
  user: User | null;
  results: Results;
  loaded: boolean;
  dashboard: Dashboard | null;
  version: number;
  refresh: () => Promise<void>;
  reloadSession: () => Promise<void>;
  signOut: () => Promise<void>;
}

const EMPTY: Results = { collection: { name: "Riverbend Flood Recovery Grant", scannedAt: "Loading…" }, docs: [], claims: [], findings: [] };
const LiveContext = createContext<Live | null>(null);

const fetchSession = (): Promise<User | null> =>
  fetch("/api/session")
    .then((r) => r.json())
    .then((d) => d.user ?? null)
    .catch(() => null);

async function fetchLive(): Promise<{ results: Results | null; dashboard: Dashboard | null }> {
  const [r, d] = await Promise.all([fetch("/api/findings"), fetch("/api/dashboard")]).catch(() => [null, null]);
  return { results: r?.ok ? await r.json() : null, dashboard: d?.ok ? await d.json() : null };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Request failed.");
  return body as T;
}

export function LiveProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [results, setResults] = useState<Results>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [version, setVersion] = useState(0);

  const reloadSession = useCallback(
    () =>
      fetchSession()
        .then(setUser)
        .finally(() => setReady(true)),
    [],
  );
  useEffect(() => {
    fetchSession()
      .then(setUser)
      .finally(() => setReady(true));
  }, []);

  const manager = user?.role === "information_manager";
  const apply = useCallback((live: Awaited<ReturnType<typeof fetchLive>>) => {
    if (live.results) setResults(live.results);
    if (live.dashboard) setDashboard(live.dashboard);
    setLoaded(true);
  }, []);
  const refresh = useCallback(async () => {
    if (manager) apply(await fetchLive());
  }, [manager, apply]);

  useEffect(() => {
    if (!user) return;
    if (manager) fetchLive().then(apply);
    const events = new EventSource("/api/events?after=now");
    let timer: number | undefined;
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setVersion((v) => v + 1);
        refresh();
      }, 300);
    };
    events.addEventListener("ledger", bump);
    events.addEventListener("reset", bump);
    return () => {
      window.clearTimeout(timer);
      events.close();
    };
  }, [user, manager, apply, refresh]);

  const signOut = useCallback(async () => {
    await fetch("/api/session", { method: "DELETE" });
    setUser(null);
    setResults(EMPTY);
    setDashboard(null);
    setLoaded(false);
  }, []);

  return (
    <LiveContext.Provider value={{ ready, user, results, loaded, dashboard, version, refresh, reloadSession, signOut }}>
      {children}
    </LiveContext.Provider>
  );
}

export function useLive(): Live {
  const live = useContext(LiveContext);
  if (!live) throw new Error("useLive needs <LiveProvider>.");
  return live;
}

/** Sends people who are not signed in (or lack the role) to the right place. Returns the user once allowed. */
export function useRequireUser(role?: Role): User | null {
  const { ready, user } = useLive();
  const router = useRouter();
  const path = usePathname();
  const allowed = Boolean(user && (!role || user.role === role));
  useEffect(() => {
    if (!ready || allowed) return;
    if (!user) router.replace(`/sign-in?next=${encodeURIComponent(path)}`);
    else router.replace(user.role === "contributor" ? "/submit" : "/dashboard");
  }, [ready, allowed, user, router, path]);
  return allowed ? user : null;
}

/** GET a JSON endpoint and refetch it whenever the ledger changes. */
export function useApi<T>(url: string | null) {
  const { version, user } = useLive();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(
    () =>
      url
        ? fetchJson<T>(url).then(
            (body) => {
              setData(body);
              setError("");
            },
            (e) => setError(e instanceof Error ? e.message : "Request failed."),
          )
        : Promise.resolve(),
    [url],
  );
  useEffect(() => {
    if (user) load();
  }, [load, version, user]);
  return { data, error, reload: load };
}

/** POST JSON and return the parsed body, throwing the server's error message. */
export async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed.");
  return data as T;
}

const NO_DASHBOARD: Dashboard = {
  lastInvestigation: { id: "", name: "Riverbend Flood Recovery Grant", documents: 0, sources: 0, lastWorked: "Loading…", reviewed: 0, total: 0, open: { bias: 0, misinformation: 0, disinformation: 0 }, next: null },
  kpis: [],
  openByType: { bias: 0, misinformation: 0, disinformation: 0 },
  recalls: 0,
  investigations: [],
  trend: { labels: ["-7d", "-6d", "-5d", "-4d", "-3d", "-2d", "-1d", "Today"], found: [0, 0, 0, 0, 0, 0, 0, 0], resolved: [0, 0, 0, 0, 0, 0, 0, 0] },
  activity: [],
  sourceWatch: [],
};

/** The live dashboard, or empty numbers while it loads. */
export function useDashboard(): Dashboard {
  return useLive().dashboard ?? NO_DASHBOARD;
}
