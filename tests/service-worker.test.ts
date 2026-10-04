/**
 * Guards on the service worker, which is the one part of the app that can serve
 * a learner the previous version of the app indefinitely.
 *
 * These assert the properties that are easy to break by accident and hard to
 * notice: an unversioned cache name, a route missing from the offline shell, or
 * a build step that quietly stops stamping.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { findProjectRoot } from "./generators.test";
import test from "node:test";

const ROOT = findProjectRoot();
// The tracked template. `public/sw.js` is generated from it by the build and is
// gitignored, so asserting against it would only ever see one machine's last
// build rather than the source of truth.
const source = readFileSync(join(ROOT, "public", "sw.source.js"), "utf8");
const stamp = readFileSync(join(ROOT, "scripts", "stamp-service-worker.ts"), "utf8");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

test("the cache name is versioned per build", () => {
  // A literal cache name is the bug: a returning learner keeps the old cache
  // because the browser sees the same name, and the bundled question bank goes
  // stale along with it.
  assert.ok(
    source.includes("__BUILD_ID__"),
    "public/sw.source.js should carry a __BUILD_ID__ placeholder rather than a fixed cache name",
  );
  assert.ok(
    /const CACHE = "specwise-/.test(source),
    "the cache name should still be namespaced so activation can identify it",
  );
  assert.ok(
    !/const CACHE = "specwise-v?\d*"/.test(source),
    "the cache name must not be a fixed version literal",
  );
});

test("the build step that stamps the cache is wired into the build", () => {
  assert.ok(
    pkg.scripts.build?.includes("stamp-service-worker"),
    "`npm run build` must run scripts/stamp-service-worker.ts or the placeholder ships to production",
  );
  assert.ok(stamp.includes("__BUILD_ID__"), "the stamp script must fail loudly if the placeholder is gone");
  assert.ok(
    stamp.includes("process.exit(1)"),
    "the stamp script must fail the build rather than silently shipping an unversioned cache",
  );
});

test("every exported route is in the offline shell", () => {
  const shell = /const SHELL = \[([\s\S]*?)\]/.exec(source);
  assert.ok(shell, "public/sw.source.js should declare a SHELL list");
  const listed = [...(shell[1]!.matchAll(/"([^"]+)"/g))].map((m) => m[1]!);

  // Derived from the app's own route directories so a new screen cannot be added
  // without this failing.
  const routes = ["plan", "practice", "test", "chapters", "notebook", "review", "stats"].map(
    (r) => `/${r}/`,
  );
  for (const route of ["/", ...routes]) {
    assert.ok(listed.includes(route), `${route} is missing from the service worker shell`);
  }
});

test("a failed precache does not stop the worker taking over", () => {
  // If skipWaiting is chained behind the precache, a single 404 leaves the
  // previous worker in charge and the update never lands.
  const install = /addEventListener\("install"[\s\S]*?\}\);/.exec(source);
  assert.ok(install, "public/sw.source.js should have an install handler");
  assert.ok(
    install[0].includes("skipWaiting"),
    "install should call skipWaiting so a new worker is not left waiting forever",
  );
  assert.ok(
    /addAll\([^)]*\)[\s\S]{0,80}?catch/.test(install[0]),
    "the precache should catch its own failure, since addAll is atomic and rejects on any single 404",
  );
});

test("activation only keeps the current cache", () => {
  const activate = /addEventListener\("activate"[\s\S]*?\}\);/.exec(source);
  assert.ok(activate, "public/sw.source.js should have an activate handler");
  assert.ok(
    activate[0].includes("CACHE"),
    "activate should keep the current cache and delete the rest, so a deploy cannot be served from the old one",
  );
});

test("error responses are not cached", () => {
  // Caching a 404 pins a transient failure to that route until the next deploy.
  const navigations = /request\.mode === "navigate"[\s\S]*?\n  \}/.exec(source);
  assert.ok(navigations, "public/sw.source.js should have a navigation branch");
  assert.ok(
    /response\.ok/.test(navigations[0]),
    "the navigation branch should check response.ok before writing to the cache",
  );
});

test("the exported worker, when present, has been stamped", () => {
  const exported = join(ROOT, "out", "sw.js");
  if (!existsSync(exported)) return; // no build yet; nothing to check
  const worker = readFileSync(exported, "utf8");
  assert.ok(!worker.includes("__BUILD_ID__"), "out/sw.js still contains the build id placeholder");
  assert.ok(
    /const CACHE = "specwise-[0-9a-f]{6,}"/.test(worker),
    "out/sw.js should carry a real build id in its cache name",
  );
});
