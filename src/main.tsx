import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app";
import { requestJson } from "./lib/net";
import { isReloadBlocked } from "./lib/reload-guard";
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
let reloadPending = false;
let lastInput = Date.now();

async function readBuildId(): Promise<string | undefined> {
  const version = await requestJson<{ buildId?: string }>(`/version.json?t=${Date.now()}`, {}, 5_000);
  return typeof version?.buildId === "string" ? version.buildId : undefined;
}

async function reloadWhenIdle(): Promise<void> {
  if (Date.now() - lastInput < IDLE_BEFORE_RELOAD_MS || isReloadBlocked()) {
    setTimeout(() => void reloadWhenIdle(), IDLE_RECHECK_MS);
    return;
  }
  try {
    // Check the LAN again before leaving the currently working page.
    const latest = await readBuildId();
    if (!latest) throw new Error("Build version unavailable");
    if (Date.now() - lastInput < IDLE_BEFORE_RELOAD_MS || isReloadBlocked()) {
      setTimeout(() => void reloadWhenIdle(), IDLE_RECHECK_MS);
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("_qms_build", latest);
    window.location.replace(url.toString());
  } catch {
    setTimeout(() => void reloadWhenIdle(), IDLE_RECHECK_MS);
  }
}

function scheduleReload(): void {
  if (reloadPending) return;
  reloadPending = true;
  void reloadWhenIdle();
}

/** Runs on plain LAN HTTP as well as HTTPS, without a service worker. */
function watchBuildVersion(): void {
  const bumpInput = () => { lastInput = Date.now(); };
  window.addEventListener("pointerdown", bumpInput, { passive: true, capture: true });
  window.addEventListener("keydown", bumpInput, { passive: true, capture: true });
  let checking = false;
  const check = async () => {
    if (checking || reloadPending) return;
    checking = true;
    try {
      const latest = await readBuildId();
      if (latest && latest !== BUILD_ID) scheduleReload();
    } catch { /* unavailable LAN or older deployment; try on the next check */ }
    finally { checking = false; }
  };
  setInterval(() => void check(), UPDATE_CHECK_MS);
  window.addEventListener("online", () => void check());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void check();
  });
  void check();
}

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

  // A redeploy must never yank the page out from under someone mid-order, so the
  // reload waits for the screen to go quiet. The TV is always quiet; the counter
  // and table tablets reload in the next lull.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloadPending) return;
    scheduleReload();
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

if (import.meta.env.PROD) watchBuildVersion();

if ("serviceWorker" in navigator) {
  if (new URLSearchParams(window.location.search).has("nosw")) {
    void purgeServiceWorker();
  } else if (import.meta.env.PROD) {
    window.addEventListener("load", registerServiceWorker);
  }
}
