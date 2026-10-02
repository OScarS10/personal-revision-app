"use client";

import { useSyncExternalStore } from "react";
import {
  resolvedThemeSnapshot,
  setThemeChoice,
  subscribeTheme,
  themeChoiceSnapshot,
  type ResolvedTheme,
  type ThemeChoice,
} from "@/lib/theme";

/*
  Theme switch.

  The <html> attribute is written from two places, deliberately:

  - The inline script in the root layout sets it during HTML parsing, so the
    first paint is already correct.
  - subscribeTheme re-applies it on mount, because React's dev-mode Strict Mode
    remount clears attributes it does not manage from JSX, which would otherwise
    leave the document on the server default. This is a no-op in production.

  Both the preference and the resolved appearance come from useSyncExternalStore
  rather than useState. That is what removes the need for a mounted flag: React
  renders the server snapshot during hydration and the browser snapshot after, so
  the first client render already agrees with what the inline script painted and
  there is no flash of the wrong theme.
*/

const ORDER: ThemeChoice[] = ["light", "system", "dark"];

const ICON: Record<ResolvedTheme, string> = {
  light: "M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2.2a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6ZM11 1.6h2v3.2h-2V1.6Zm0 17.6h2v3.2h-2v-3.2ZM1.6 11h3.2v2H1.6v-2Zm17.6 0h3.2v2h-3.2v-2ZM4.2 5.8l1.4-1.4 2.3 2.3-1.4 1.4-2.3-2.3Zm12.1 12.1 1.4-1.4 2.3 2.3-1.4 1.4-2.3-2.3Zm2.3-13.5-1.4-1.4-2.3 2.3L16.3 3l2.3 2.4ZM6.4 17.9 4.1 19.2l-2.3-2.3 1.4-1.4 2.2 2.4Z",
  dark: "M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.6 8.6 0 1 0 11 11Z",
};

const LABEL: Record<ThemeChoice, string> = {
  light: "Light",
  system: "System",
  dark: "Dark",
};

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const choice = useSyncExternalStore(
    subscribeTheme,
    themeChoiceSnapshot,
    // The server cannot know the preference, and the inline script has already
    // decided what to paint, so this only affects the very first server render.
    () => "system" as ThemeChoice,
  );
  const resolved = useSyncExternalStore(
    subscribeTheme,
    resolvedThemeSnapshot,
    () => "light" as ResolvedTheme,
  );

  function cycle() {
    setThemeChoice(ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]);
  }

  const icon = (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] shrink-0" aria-hidden="true">
      <path d={ICON[resolved]} fill="currentColor" />
    </svg>
  );

  if (compact) {
    return (
      <button
        type="button"
        onClick={cycle}
        className="btn btn-sm btn-ghost px-2"
        title={`Theme: ${LABEL[choice]}. Click to change.`}
        aria-label={`Theme: ${LABEL[choice]}. Switch theme.`}
      >
        {icon}
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="border-rule bg-surface-2 inline-flex rounded-[3px] border p-0.5"
    >
      {ORDER.map((option) => {
        const active = option === choice;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            title={
              option === "system"
                ? "Follow your device's light or dark setting"
                : `${LABEL[option]} theme`
            }
            onClick={() => setThemeChoice(option)}
            className={[
              "flex items-center gap-1.5 rounded-[2px] px-2 py-1 text-[12px] font-medium transition-colors",
              active
                ? "bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]"
                : "text-ink-3 hover:text-ink-2",
            ].join(" ")}
          >
            {option === choice ? icon : null}
            <span>{LABEL[option]}</span>
          </button>
        );
      })}
    </div>
  );
}