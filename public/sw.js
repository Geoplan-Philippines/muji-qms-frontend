/**
 * Minimal service worker — its job is to make the app installable as a PWA and
 * keep the shell available if the network blips. It deliberately does NOT touch
 * the live queue traffic (socket.io / API), which must always hit the network.
 *
 * Two rules here exist because breaking them stranded kiosks in the field:
 *
 *  1. Only 2xx responses are ever cached. A static host without SPA-fallback
 *     answers /staff and /table with a 404, and a 404 is a perfectly cacheable
 *     response — caching one as "/index.html" poisons the offline shell so that
 *     every later boot serves the 404, and a plain reload can't fix it.
 *
 *  2. The cache name carries the build id stamped into this file by Vite.
 *     A fixed name meant a redeployed build kept serving the old
 *     shell, so devices could quietly run a bundle with a stale API address.
 */
// Replaced during production builds so reg.update() detects changed bytes,
// even when an already-open page still checks the old script URL.
const VERSION = "__QMS_BUILD_ID__";
const CACHE = `muji-qms-${VERSION}`;

/** A cold boot races the Wi-Fi association; don't hang the shell waiting on it. */
const NAV_TIMEOUT_MS = 4000;

const SHELL = "/index.html";

self.addEventListener("install", (event) => {
  // Cache the entry document so a cold launch works offline. Failure here is
  // survivable (the app just isn't offline-capable yet), so don't reject.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        fetch(SHELL, { cache: "reload" })
          .then((res) => (res.ok ? cache.put(SHELL, res) : undefined))
          .catch(() => undefined),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // Drop every other build's cache — the version is in the name.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("muji-qms-") && k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// Lets the page force an immediate takeover after it detects a new build.
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GETs. Everything else (sockets, POSTs, APIs,
  // cross-origin) goes straight to the network untouched.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/socket.io") || url.pathname.startsWith("/api") ||
    url.pathname === "/version.json" || url.searchParams.has("recovery")) return;

  // Navigations: network-first so the latest app loads, cache as offline
  // fallback. The timeout matters at boot — the device often loads the URL
  // before Wi-Fi has associated, and without it the screen sits blank.
  if (request.mode === "navigate") {
    event.respondWith(
      Promise.race([fetch(request), timeout(NAV_TIMEOUT_MS)])
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE).then((c) => c.put(SHELL, copy)));
          return res;
        })
        .catch(() =>
          caches.match(SHELL).then(
            (cached) =>
              cached ||
              new Response(
                "<!doctype html><meta charset=utf-8><title>MUJI Queue</title>" +
                  "<body style=\"font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0\">" +
                  "Waiting for the counter server…<script>setTimeout(()=>location.reload(),5000)</script>",
                { headers: { "Content-Type": "text/html; charset=utf-8" } },
              ),
          ),
        ),
    );
    return;
  }

  // Static assets (Vite emits content-hashed names): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type !== "opaque") {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put(request, copy)));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
