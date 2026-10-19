"use client";

import { useCallback, useEffect, useState } from "react";
import type { ResultsPayload } from "@/lib/types";

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export const postJson = <T,>(url: string, body: unknown, method = "POST") =>
  api<T>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Reads a query parameter on the client without needing a Suspense boundary. */
export function readParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * Which scan the page should show: ?scan=<id> if present, otherwise the most recent finished scan.
 * `ready` is false until that has been worked out, so pages can show a skeleton instead of flashing "empty".
 */
export function useScanId(): { scanId: string | null; ready: boolean } {
  const [state, setState] = useState<{ scanId: string | null; ready: boolean }>({ scanId: null, ready: false });
  useEffect(() => {
    let cancelled = false;
    const fromUrl = readParam("scan");
    if (fromUrl) {
      // The URL is only readable after mount, so this has to set state from the effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ scanId: fromUrl, ready: true });
      return;
    }
    api<{ id: string | null }>("/api/scans/latest")
      .then((r) => !cancelled && setState({ scanId: r.id, ready: true }))
      .catch(() => !cancelled && setState({ scanId: null, ready: true }));
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

export function useFetch<T>(url: string | null): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);

  const load = useCallback(async () => {
    if (!url) return;
    try {
      setData(await api<T>(url));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    // Loading state is derived from the request, so this effect only starts it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

export const useResults = (scanId: string | null) => useFetch<ResultsPayload>(scanId ? `/api/scans/${scanId}/results` : null);

export const withScan = (path: string, scanId: string | null | undefined) => (scanId ? `${path}?scan=${scanId}` : path);

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  if (s < 86400 * 2) return "yesterday";
  return `${Math.round(s / 86400)} days ago`;
}
