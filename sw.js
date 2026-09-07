/*
 * Service worker for offline/installable support (PWA). Precaches the app's
 * static files on install and serves them cache-first, falling back to the
 * network for anything not cached. Bumping CACHE_VERSION on future changes
 * gives the new cache a new name, so activate() can delete every old
 * versioned cache instead of updates getting stuck serving stale files
 * forever.
 */

const CACHE_VERSION = "v8";
const CACHE_NAME = `sudoku-static-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "index.html",
  "manifest.json",
  "sudoku-logic.js",
  "sudoku-ui.js",
  "icons/icon-144.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-512-maskable.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("sudoku-static-") && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// CountAPI's live hit counter must always be requested fresh -- never
// served from or written to the cache -- both because it's a live count
// that should never show stale offline data, and because it increments on
// every call: serving a cached response would just mean showing an old
// number, but writing one into Cache Storage risks it later being replayed
// instead of a real hit.
function isNetworkOnly(url) {
  if (url.hostname === "countapi.mileshilliard.com") return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (isNetworkOnly(url)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline and not in cache under this exact URL -- the most common
          // case is a navigation to "/" or "/Sudoku-App/" whose cache key
          // differs from the precached "index.html", so fall back to that.
          if (event.request.mode === "navigate") {
            return caches.match("index.html");
          }
          throw new Error("Network request failed and no cache entry exists");
        });
    })
  );
});
