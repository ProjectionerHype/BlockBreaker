const CACHE_NAME = "block-breaker-v2";

const STATIC_ASSETS = [
  "/favicon.svg",
  "/manifest.json",
  "/robots.txt",
  "/sitemap.xml",
  "/opengraph.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // For truly static assets (images, icons, manifest) — cache-first
  const isStaticAsset =
    url.pathname.match(/\.(svg|png|jpg|jpeg|webp|ico|json|txt|xml)$/) &&
    !url.pathname.endsWith("manifest.json") === false
      ? true
      : STATIC_ASSETS.some((a) => url.pathname === a);

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // For everything else (HTML, JS, CSS) — network-first so updates always show
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline fallback
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.destination === "document") {
            return caches.match("/index.html");
          }
        });
      })
  );
});
