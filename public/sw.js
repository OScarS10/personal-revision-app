/*
  Offline support.

  The app is already a static export with no server and no network calls after
  load, so the only thing missing is the browser's willingness to keep the
  assets around. A service worker does that, and it matters most for the case
  this app is actually used in: revision on a bus with intermittent signal.

  Two deliberate limitations:
  - the cache is not updated in the background, because a stale question bank is
    worse than a slightly older one, and a versioned cache-first strategy with an
    explicit refresh keeps that visible;
  - nothing is pre-cached beyond the shell, so the first offline load still needs
    a visit while online.
*/

const CACHE = "specwise-v1";

const SHELL = ["/", "/plan/", "/practice/", "/chapters/", "/notebook/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => {
        // A failed precache must not block installation: the app still works
        // online and will cache as it is used.
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
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
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
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
