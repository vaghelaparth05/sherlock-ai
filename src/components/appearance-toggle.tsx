"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Appearance = "light" | "dark";
const STORAGE_KEY = "sherlock-appearance";

export function AppearanceToggle() {
  const [appearance, setAppearance] = useState<Appearance>("light");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Keep the default light appearance when browser storage is unavailable.
    }
    const initial: Appearance = saved === "dark" || saved === "light"
      ? saved
      : document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = initial;
    setAppearance(initial);
  }, []);

  function toggleAppearance() {
    // Use the document as the source of truth so multiple toggles or route
    // transitions cannot leave this control with stale React state.
    const next: Appearance = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The current page still switches appearance if browser storage is unavailable.
    }
    setAppearance(next);
  }

  const nextAppearance = appearance === "dark" ? "light" : "dark";
  const Icon = appearance === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggleAppearance}
      aria-pressed={appearance === "dark"}
      aria-label={`Switch to ${nextAppearance} appearance`}
      title={`Switch to ${nextAppearance} appearance`}
      data-appearance-toggle
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-elevated text-muted transition-colors hover:bg-hover hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  );
}
