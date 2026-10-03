import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  applyChoice,
  applyTheme,
  readThemeChoice,
  resolvedThemeSnapshot,
  setThemeChoice,
  subscribeTheme,
  systemTheme,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  themeChoiceSnapshot,
} from "@/lib/theme";

/*
  Theme behaviour, tested against the browser globals it depends on.

  "Light/dark and system don't actually work" was a real report, and the cause was
  specific: the OS-change listener only asked React to re-render, and never wrote
  the `data-theme` attribute the CSS keys off. So the page kept the old palette
  until something unrelated forced a repaint. These tests drive the listener
  directly and assert on the attribute, because that attribute is the thing the
  bug was about.

  These stubs are minimal on purpose - `matchMedia` with no `addEventListener` would
  make `subscribeTheme` throw, so the stub implements the listener API even though
  the tests never use it.
*/

interface FakeMedia {
  matches: boolean;
  listeners: Set<() => void>;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
  /** Simulate the OS flipping its colour scheme. */
  flip(matches: boolean): void;
}

const original = {
  window: globalThis.window,
  document: globalThis.document,
  localStorage: globalThis.localStorage,
  matchMedia: globalThis.matchMedia,
};

function installBrowser(osPrefersDark: boolean) {
  const media: FakeMedia = {
    matches: osPrefersDark,
    listeners: new Set(),
    addEventListener(_type, fn) {
      media.listeners.add(fn);
    },
    removeEventListener(_type, fn) {
      media.listeners.delete(fn);
    },
    flip(matches: boolean) {
      media.matches = matches;
      for (const fn of media.listeners) fn();
    },
  };

  const store = new Map<string, string>();
  const documentElement = {
    attributes: new Map<string, string>(),
    // `applyTheme` sets `style.colorScheme` so native widgets match the palette.
    style: {} as { colorScheme?: string },
    setAttribute(name: string, value: string) {
      documentElement.attributes.set(name, value);
    },
    getAttribute(name: string) {
      return documentElement.attributes.get(name) ?? null;
    },
  };

  const storageEventTarget = new Set<(event: { key: string | null; newValue: string | null }) => void>();

  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };

  const fakeWindow = {
    // `theme.ts` reaches storage through `window.localStorage`, not the bare
    // global, so the stub has to hang it off the window object.
    localStorage,
    matchMedia: (query: string) => {
      assert.match(query, /prefers-color-scheme/);
      return media;
    },
    addEventListener(type: string, fn: (event: { key: string | null; newValue: string | null }) => void) {
      if (type === "storage") storageEventTarget.add(fn);
    },
    removeEventListener(type: string, fn: (event: { key: string | null; newValue: string | null }) => void) {
      if (type === "storage") storageEventTarget.delete(fn);
    },
  };

  Object.assign(globalThis, {
    window: fakeWindow,
    document: { documentElement },
    localStorage,
    matchMedia: fakeWindow.matchMedia,
  });

  return {
    media,
    documentElement,
    store,
    themeAttribute: () => documentElement.getAttribute(THEME_ATTRIBUTE),
    emitStorage: (key: string | null, newValue: string | null) => {
      for (const fn of storageEventTarget) fn({ key, newValue });
    },
  };
}

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete (globalThis as Record<string, unknown>)[key];
    else Object.assign(globalThis, { [key]: value });
  }
});

describe("theme resolution", () => {
  it("falls back to light when the OS prefers light", () => {
    installBrowser(false);
    assert.equal(systemTheme(), "light");
  });

  it("reports dark when the OS prefers dark", () => {
    installBrowser(true);
    assert.equal(systemTheme(), "dark");
  });

  it("defaults to system with nothing stored", () => {
    installBrowser(false);
    assert.equal(readThemeChoice(), "system");
  });

  it("survives unreadable stored content", () => {
    const env = installBrowser(false);
    env.store.set(THEME_STORAGE_KEY, "{not json");
    assert.equal(readThemeChoice(), "system");
  });

  it("ignores a stored value that is not a theme", () => {
    const env = installBrowser(false);
    env.store.set(THEME_STORAGE_KEY, "neon");
    assert.equal(readThemeChoice(), "system");
  });

  it("ignores a JSON-encoded value rather than trusting the encoding", () => {
    const env = installBrowser(false);
    // Storage holds the bare string `"light"`. If a JSON-encoded value ever lands
    // here it is not a valid choice, and guessing at it would mean rendering a
    // palette the learner never chose.
    env.store.set(THEME_STORAGE_KEY, JSON.stringify("light"));
    assert.equal(readThemeChoice(), "system");
  });

  it("resolves an explicit choice without consulting the OS", () => {
    const env = installBrowser(true);
    setThemeChoice("light");
    assert.equal(resolvedThemeSnapshot(), "light");
    assert.equal(env.themeAttribute(), "light");
  });

  it("resolves the system choice from the OS", () => {
    installBrowser(true);
    assert.equal(resolvedThemeSnapshot(), "dark");
  });
});

describe("theme snapshot purity", () => {
  it("does not write to the document when read during render", () => {
    const env = installBrowser(false);
    resolvedThemeSnapshot();
    resolvedThemeSnapshot();
    // useSyncExternalStore may call this speculatively, so it must be side-effect
    // free. Writing here is what made React's render output untrustworthy.
    assert.equal(env.themeAttribute(), null);
  });

  it("returns a stable value for the same state", () => {
    installBrowser(false);
    setThemeChoice("dark");
    assert.equal(themeChoiceSnapshot(), "dark");
    assert.equal(themeChoiceSnapshot(), "dark");
  });
});

describe("theme subscription", () => {
  it("paints the document on subscribe, before any render", () => {
    const env = installBrowser(true);
    setThemeChoice("system");
    const stop = subscribeTheme(() => {});
    // A remount in Strict Mode must not leave the page unpainted.
    assert.equal(env.themeAttribute(), "dark");
    stop();
  });

  it("updates the attribute when the OS flips while on system", () => {
    const env = installBrowser(false);
    setThemeChoice("system");

    let notifications = 0;
    const stop = subscribeTheme(() => notifications++);
    assert.equal(env.themeAttribute(), "light");

    // The bug this pins: the old listener only re-rendered React and never wrote
    // the attribute, so the palette never changed.
    env.media.flip(true);
    assert.equal(env.themeAttribute(), "dark", "data-theme was not repainted on OS change");
    assert.ok(notifications > 0, "React was not told to re-render");

    env.media.flip(false);
    assert.equal(env.themeAttribute(), "light");
    stop();
  });

  it("ignores the OS flip when an explicit choice is set", () => {
    const env = installBrowser(false);
    setThemeChoice("light");
    const stop = subscribeTheme(() => {});
    env.media.flip(true);
    assert.equal(env.themeAttribute(), "light", "an explicit choice must not be overridden by the OS");
    stop();
  });

  it("adopts a preference change made in another tab", () => {
    const env = installBrowser(false);
    const stop = subscribeTheme(() => {});
    env.store.set(THEME_STORAGE_KEY, "dark");
    env.emitStorage(THEME_STORAGE_KEY, "dark");
    assert.equal(env.themeAttribute(), "dark");
    stop();
  });

  it("ignores unrelated storage writes", () => {
    const env = installBrowser(false);
    setThemeChoice("dark");

    let notifications = 0;
    const stop = subscribeTheme(() => notifications++);
    const before = notifications;

    // Progress saves write constantly; reacting to those re-read the preference and
    // repainted the document for nothing.
    env.emitStorage("specwise.state.v1", "{}");
    assert.equal(notifications, before, "reacted to an unrelated storage write");
    stop();
  });

  it("stops listening after unsubscribe", () => {
    const env = installBrowser(false);
    setThemeChoice("system");
    let notifications = 0;
    const stop = subscribeTheme(() => notifications++);
    stop();

    env.media.flip(true);
    assert.equal(notifications, 0);
    assert.equal(env.themeAttribute(), "light", "no paint after unsubscribe");
  });

  it("notifies every subscriber on a preference change", () => {
    installBrowser(false);
    let a = 0;
    let b = 0;
    const stopA = subscribeTheme(() => a++);
    const stopB = subscribeTheme(() => b++);

    setThemeChoice("dark");
    assert.ok(a > 0 && b > 0);
    stopA();
    stopB();
  });

  it("applies the same value twice without complaint", () => {
    const env = installBrowser(true);
    applyTheme("dark");
    applyTheme("dark");
    assert.equal(env.themeAttribute(), "dark");
    applyChoice("dark");
    assert.equal(env.themeAttribute(), "dark");
  });
});