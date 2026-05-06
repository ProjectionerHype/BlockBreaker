const CACHE_NAME = "block-breaker-v1";

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.svg",
  "/robots.txt",
  "/sitemap.xml",
];

// Install: cache all core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: serve from cache first, fall back to network then cache the response
self.addEventListener("fetch", (event) => {
  // Only handle same-origin GET requests
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          // Cache valid responses dynamically (JS, CSS, fonts, etc.)
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline fallback: return the cached homepage
          if (event.request.destination === "document") {
            return caches.match("/index.html");
          }
        });
    })
  );
});
