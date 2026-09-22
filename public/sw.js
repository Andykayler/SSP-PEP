// public/sw.js
// ─────────────────────────────────────────────────────────────────────────────
// Makes Acalink installable and keeps the app SHELL available with no network.
//
// What this deliberately does NOT do: cache Firestore reads, API responses, or
// anything cross-origin. Firestore's own persistent local cache
// (persistentLocalCache in src/firebase.js) already makes data durable offline
// and handles sync when the connection returns — duplicating that here would
// only risk serving stale data past when Firestore itself would. This service
// worker's job is narrower and complementary: without it, a teacher who opens
// the app with no signal gets a browser error page, because there is nothing
// on disk to show. With it, the same JS/CSS/HTML that already ran once loads
// again, and Firestore's cache carries the data.
//
// Two caches, two strategies:
//   SHELL   the built JS/CSS/icons under /assets and /icons — content-hashed
//           by Vite, so cache-first is safe: a filename never changes meaning.
//   PAGES   navigations (opening/reloading a URL) — network-first, so a
//           returning connection is always preferred, falling back to the
//           last cached copy of that page, and then to offline.html.
//
// Bump CACHE_VERSION when this file's *strategy* changes; the build's own
// content hashes handle everyday asset changes without a version bump here.
// ─────────────────────────────────────────────────────────────────────────────
const CACHE_VERSION = "v1";
const SHELL_CACHE = `acalink-shell-${CACHE_VERSION}`;
const PAGES_CACHE = `acalink-pages-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGES_CACHE).then((cache) => cache.addAll(["/", OFFLINE_URL])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((k) => k !== SHELL_CACHE && k !== PAGES_CACHE)
        .map((k) => caches.delete(k)),
    )),
  );
  self.clients.claim();
});

function isShellAsset(url) {
  return url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest";
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;                     // never intercept writes

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;           // Firestore, WaAPI, etc. — untouched

  // Full-page navigations: network first, cached copy second, offline page last.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGES_CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/") || caches.match(OFFLINE_URL))),
    );
    return;
  }

  // Built assets: content-hashed by Vite, so cache-first is safe and fast.
  if (isShellAsset(url)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
        return res;
      })),
    );
  }
});
