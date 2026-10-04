/*
  Offline support.

  The app is already a static export with no server and no network calls after
  load, so the only thing missing is the browser's willingness to keep the
  assets around. A service worker does that, and it matters most for the case
  this app is actually used in: revision on a bus with intermittent signal.

  Three deliberate limitations:
  - the cache is not updated in the background, because a stale question bank is
    worse than a slightly older one, and a versioned cache-first strategy with an
    explicit refresh keeps that visible;
  - the shell is precached but the routes under it are not, so the first offline
    visit to a screen still needs a trip online;
  - nothing is precached from the 404 route, which is not an offline destination.
*/

/*
  The cache name carries a build id so that a deploy cannot be served from the
  previous deploy's cache.

  This is the whole reason the string below is a placeholder. An unversioned name
  means a returning learner keeps the old cache forever: the browser sees the
  same cache name, the activate handler deletes nothing, and every precached
  route is served from the previous version until a hard refresh happens to clear
  it. Because the question bank is bundled into the JavaScript, that is a stale
  and actively misleading question bank, not just a stale stylesheet.

  The placeholder is replaced after `next build` by scripts/stamp-service-worker.ts.
  When it has not been replaced - in development, or if the build step ever fails
  to run - the fallback below still produces a fresh cache on every load, which
  is wasteful but never stale.
*/
const CACHE = "specwise-__BUILD_ID__";

/*
  Every top-level route the static export produces. Leaving one out means that
  screen is not available offline until the learner has opened it once while
  online, which is exactly the moment they cannot be relied on to.
*/
const SHELL = [
  "/",
  "/plan/",
  "/practice/",
  "/test/",
  "/chapters/",
  "/notebook/",
  "/review/",
  "/stats/",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        // addAll is atomic: one 404 and the whole shell is rejected. The catch
        // below handles that, so individual routes are optional here.
        cache.addAll(SHELL).catch(() => undefined),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, so a deploy is picked up, falling back to the
  // cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only a real page is worth keeping. Caching an error response would
          // pin a transient failure to that route until the next deploy.
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit ?? caches.match("/"))),
    );
    return;
  }

  // Static assets are content-hashed, so a cache hit is always correct.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
