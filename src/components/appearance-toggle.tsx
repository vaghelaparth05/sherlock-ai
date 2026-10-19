"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type Appearance = "light" | "dark";
const STORAGE_KEY = "sherlock-appearance";

// The document's data-theme attribute is the source of truth. The inline script in the root
// layout sets it from storage before first paint, so this control only reads and flips it.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const current = (): Appearance => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const onServer = (): Appearance => "light";

export function AppearanceToggle() {
  const appearance = useSyncExternalStore(subscribe, current, onServer);

  function toggleAppearance() {
    const next: Appearance = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The current page still switches appearance if browser storage is unavailable.
    }
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
