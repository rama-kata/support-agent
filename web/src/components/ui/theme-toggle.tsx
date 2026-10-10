"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { writeStore } from "@/lib/session";

const query = "(prefers-color-scheme: dark)";

// The theme lives on <html data-theme>, falling back to the OS setting; both can change
// outside React, so read them as an external store.
function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  const observer = new MutationObserver(onChange);
  media.addEventListener("change", onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    media.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

function isDark() {
  const saved = document.documentElement.dataset.theme;
  return saved ? saved === "dark" : window.matchMedia(query).matches;
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    writeStore("theme", next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="grid size-9 place-items-center rounded-lg text-ink-soft transition hover:bg-surface-2 hover:text-ink"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
