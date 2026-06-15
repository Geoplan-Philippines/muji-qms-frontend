// Minimal service worker — its job is to make the app installable as a PWA and
// keep the shell available if the network blips. It deliberately does NOT touch
// the live queue traffic (socket.io / API), which must always hit the network.
const CACHE = "muji-qms-v1";

self.addEventListener("install", (event) => {
  // Cache the entry document so a cold launch works offline.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["/", "/index.html"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Drop old cache versions when CACHE name changes.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GETs. Everything else (sockets, POSTs, APIs,
  // cross-origin) goes straight to the network untouched.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/socket.io") || url.pathname.startsWith("/api")) return;

  // Navigations: network-first so the latest app loads, cache as offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html").then((r) => r || caches.match("/"))),
    );
    return;
  }

  // Static assets (Vite emits content-hashed names): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
