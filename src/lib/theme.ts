"use client";

/*
  Theme preference: light, dark, or follow the system.

  Deliberately NOT part of PersistedState. That blob is the learner's revision
  history: it is versioned, migrated, exported as a backup file and validated on
  import. A display preference has none of those concerns, and putting it there
  would mean a theme choice could block a backup restore or be lost when a
  migration ran. It gets its own localStorage key instead, so clearing progress
  does not reset the theme and importing a backup does not overwrite it.

  Three states rather than two because "follow the system" is the answer most
  people want and the one that stays correct when they travel or change laptop.
*/

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "specwise-theme";

/** Attribute on <html>, so CSS can select tokens without any JS at paint time. */
export const THEME_ATTRIBUTE = "data-theme";

function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

export function readThemeChoice(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(raw) ? raw : "system";
  } catch {
    // Private mode or storage disabled. Falling back to system is correct here
    // because the inline script in the layout will have made the same decision.
    return "system";
  }
}

export function writeThemeChoice(choice: ThemeChoice): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Preference will not survive a reload, but the session still works, so
    // there is nothing useful to tell the user here.
  }
}

export function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Paint the theme before first render.
 *
 * Inlined into <head> as a string rather than imported as a module, because a
 * module's effect runs after the HTML has already painted. That gap is a white
 * flash for anyone on a dark-mode device, and on this app it would happen on
 * every navigation, because the shell is remounted.
 *
 * Kept as source text so it is type-checked and importable in tests; the tests
 * assert the behaviour of the DOM writes rather than the literal text.
 */
export const THEME_BOOTSTRAP = `(function(){try{
var c=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
if(c!=="light"&&c!=="dark"){c="system"}
var d=c==="dark"||(c==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);
var r=document.documentElement;
r.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},d?"dark":"light");
r.style.colorScheme=d?"dark":"light";
}catch(e){}})();`;

/**
 * Apply a resolved theme to the document.
 *
 * Writes both the attribute and `style.colorScheme`. The attribute alone leaves
 * native widgets - scrollbars, date pickers, the autofill dropdown - rendering
 * light-themed controls inside a dark page, which looks like a rendering bug.
 */
export function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute(THEME_ATTRIBUTE, theme);
  root.style.colorScheme = theme;
}

export function applyChoice(choice: ThemeChoice): ResolvedTheme {
  const resolved: ResolvedTheme = choice === "system" ? systemTheme() : choice;
  applyTheme(resolved);
  return resolved;
}

// -------------------------------------------------------------------- store

/*
  The preference is an external store rather than React state. Reading
  localStorage and matchMedia into useState would mean writing state from an
  effect, which React flags as a cascading render and which gets the value one
  paint too late.

  useSyncExternalStore solves both halves of that: getServerSnapshot supplies
  the render the server produced, and the browser snapshot takes over on
  hydration, so the first client render already agrees with the DOM and there is
  no hydration mismatch to paper over with a mounted flag.
*/

type Listener = () => void;

const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

/** Current preference. Read on every render, so it must stay cheap and pure. */
export function themeChoiceSnapshot(): ThemeChoice {
  return readThemeChoice();
}

/**
 * Resolved appearance, which also changes when the OS setting changes.
 *
 * Pure on purpose. useSyncExternalStore calls this during render and compares
 * the result with the previous one, so writing to the DOM from here is both
 * unreliable and misplaced: React may call it speculatively, and a getSnapshot
 * that mutates the document cannot be trusted to be idempotent. The DOM write
 * lives in subscribeTheme and setThemeChoice, which run at the right moments.
 */
export function resolvedThemeSnapshot(): ResolvedTheme {
  const choice = readThemeChoice();
  return choice === "system" ? systemTheme() : choice;
}

/**
 * Watch the preference, the OS setting, and other tabs.
 *
 * Every path here paints the document before telling React, rather than leaving
 * the write to a re-render. That ordering is the fix for "system does nothing":
 * when the OS flips to dark at sunset, the media listener resolves the new
 * appearance and writes `data-theme` straight away. Previously the listener only
 * asked React to re-render, so the attribute the CSS keys off was never updated
 * and the page kept the old palette until something else forced a repaint.
 */
export function subscribeTheme(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.add(onChange);

  const media = window.matchMedia("(prefers-color-scheme: dark)");

  const onMediaChange = () => {
    applyChoice(readThemeChoice());
    onChange();
  };

  // Only this key matters. Reacting to every storage write meant the theme was
  // reapplied on every unrelated saveState, which is wasteful and, because
  // storage events also fire for other tabs, re-read the preference needlessly.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    applyChoice(readThemeChoice());
    onChange();
  };

  media.addEventListener("change", onMediaChange);
  window.addEventListener("storage", onStorage);

  // Covers the Strict Mode remount described above, and any case where the
  // inline bootstrap ran before this tab's preference was readable.
  applyChoice(themeChoiceSnapshot());

  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", onMediaChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Persist a preference and paint it, then tell every listener. */
export function setThemeChoice(choice: ThemeChoice): void {
  writeThemeChoice(choice);
  applyChoice(choice);
  emit();
}