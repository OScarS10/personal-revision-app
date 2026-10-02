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

/** Resolved appearance, which also changes when the OS setting changes. */
export function resolvedThemeSnapshot(): ResolvedTheme {
  return applyChoice(themeChoiceSnapshot());
}

/**
 * Watch the preference, the OS setting, and other tabs.
 *
 * Re-applies the theme on subscribe as well as on change. Strict Mode remounts
 * effects in development, and React clears attributes it does not manage from
 * JSX, so without this the document would be left on the server default.
 */
export function subscribeTheme(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.add(onChange);

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  // Another tab changing the theme should move this one too.
  window.addEventListener("storage", onChange);

  // Covers the Strict Mode remount described above.
  applyChoice(themeChoiceSnapshot());

  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Persist a preference and paint it, then tell every listener. */
export function setThemeChoice(choice: ThemeChoice): void {
  writeThemeChoice(choice);
  applyChoice(choice);
  emit();
}