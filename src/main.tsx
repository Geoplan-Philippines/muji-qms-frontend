import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/* --- Service worker ------------------------------------------------------
 * The SW exists so the app installs as a PWA (fullscreen, no browser bar) and
 * survives a network blip at boot. On always-on kiosks it also has to be able to
 * get *out* of the way: a bad or stale cached shell used to be unrecoverable
 * short of wiping the browser's data by hand, so there is an explicit escape
 * hatch and an automatic update path.
 */

const BUILD_ID = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";
/** Re-check for a redeployed build this often (kiosks run for weeks). */
const UPDATE_CHECK_MS = 30 * 60_000;
/** Don't reload for an update until the screen has been idle this long. */
const IDLE_BEFORE_RELOAD_MS = 30_000;
const IDLE_RECHECK_MS = 10_000;

/** On-site escape hatch: append ?nosw=1 to strip the worker and every cache. */
async function purgeServiceWorker(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch (err) {
    console.warn("[qms] could not purge service worker:", err);
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("nosw");
  window.location.replace(url.toString());
}

function registerServiceWorker(): void {
  // Capture this before registering: on a first-ever install `clients.claim()`
  // fires controllerchange immediately, and reloading on that would loop.
  const hadController = !!navigator.serviceWorker.controller;
  let reloadPending = false;

  // A redeploy must never yank the page out from under someone mid-order, so the
  // reload waits for the screen to go quiet. The TV is always quiet; the counter
  // and table tablets reload in the next lull.
  let lastInput = Date.now();
  const bumpInput = () => {
    lastInput = Date.now();
  };
  window.addEventListener("pointerdown", bumpInput, { passive: true, capture: true });
  window.addEventListener("keydown", bumpInput, { passive: true, capture: true });

  const reloadWhenIdle = () => {
    if (Date.now() - lastInput < IDLE_BEFORE_RELOAD_MS) {
      setTimeout(reloadWhenIdle, IDLE_RECHECK_MS);
      return;
    }
    console.log("[qms] new build activated — reloading");
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloadPending) return;
    reloadPending = true;
    reloadWhenIdle();
  });

  // The build id in the query string is what makes the browser see a redeploy
  // as a different worker; it also names the cache (see public/sw.js).
  navigator.serviceWorker
    .register(`/sw.js?v=${encodeURIComponent(BUILD_ID)}`)
    .then((reg) => {
      const promote = () => {
        if (reg.waiting) reg.waiting.postMessage("skip-waiting");
      };
      promote();
      reg.addEventListener("updatefound", () => {
        reg.installing?.addEventListener("statechange", promote);
      });

      const check = () => {
        reg.update().catch(() => {
          /* offline — the next check will pick it up */
        });
      };
      setInterval(check, UPDATE_CHECK_MS);
      window.addEventListener("online", check);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    })
    .catch(() => {
      /* registration failed — the app still works, just not offline-capable */
    });
}

if ("serviceWorker" in navigator) {
  if (new URLSearchParams(window.location.search).has("nosw")) {
    void purgeServiceWorker();
  } else if (import.meta.env.PROD) {
    window.addEventListener("load", registerServiceWorker);
  }
}
