import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  extractNumber,
  parseServerTime,
  type QueueItem,
  type QueueStatus,
} from "../../shared/qms.ts";
import { isRequestFailure, requestJson, requestVoid, withRetry } from "./net";
import { isReloadBlocked } from "./reload-guard";

const API_URL =
  ((import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000").replace(
    /\/$/,
    "",
  );

// Guard against a .env that was copied from .env.example but never filled in.
// An unset store id used to fail completely silently: no room was joined and the
// order fetch short-circuited to an empty list, so the screen just sat there
// blank and "Connected". Now it surfaces as a visible error instead.
const RAW_STORE_ID = (import.meta.env.VITE_STORE_ID as string | undefined)?.trim();
const STORE_ID =
  RAW_STORE_ID && RAW_STORE_ID.length > 0 && !/^your-store/i.test(RAW_STORE_ID)
    ? RAW_STORE_ID
    : undefined;

const CHIME_KEY = "muji-qms:chime";
const DEBUG_KEY = "muji-qms:debug";
const RELOAD_COUNT_KEY = "muji-qms:recovery-reloads";

/* --- Health tuning ------------------------------------------------------- */

/** Reconcile against the backend this often while everything looks healthy. */
const SYNC_INTERVAL_MS = 15_000;
/** Reconcile this often while the socket is unhealthy — polling is the only data path then. */
const SYNC_INTERVAL_DEGRADED_MS = 3_000;
/** engine.io pings every ~25s. Past this much silence a "connected" socket is a corpse. */
const SOCKET_SILENCE_MS = 60_000;
/** How often the watchdog re-evaluates health. */
const WATCHDOG_INTERVAL_MS = 5_000;
/** The board is only trustworthy if it reconciled this recently. */
const STALE_AFTER_MS = 45_000;
/** Both data paths dead this long → reload the page (the automated hard reset). */
const RECOVERY_RELOAD_MS = 5 * 60_000;
/** Never auto-reload out from under someone who is actively using the screen. */
const RECENT_INPUT_MS = 60_000;
/** How long to wait for the backend to acknowledge the room join. */
const JOIN_ACK_MS = 5_000;
/** Window after a local action in which a changed snapshot is our own doing. */
const LOCAL_ACTION_QUIET_MS = 10_000;
/**
 * Staff actions get a tighter budget than the background poll. On a LAN a round
 * trip is milliseconds, so a long timeout here only means staring at a stale
 * error toast — and the reconcile poll is what establishes the truth anyway.
 * Worst case before an action reports failure: ~10s.
 */
const MUTATION_TIMEOUT_MS = 5_000;
const MUTATION_TRIES = 2;

/* --- Logging ------------------------------------------------------------- */

// Lifecycle events always log — these kiosks get debugged by reading the console
// through Fully Kiosk's remote admin, so the breadcrumbs have to be there. The
// per-event firehose is opt-in via ?debug=1 or localStorage muji-qms:debug=1.
const DEBUG = (() => {
  try {
    return (
      new URLSearchParams(window.location.search).has("debug") ||
      localStorage.getItem(DEBUG_KEY) === "1"
    );
  } catch {
    return false;
  }
})();

const note = (...args: unknown[]) => console.log("[qms]", ...args);
const warn = (...args: unknown[]) => console.warn("[qms]", ...args);
const trace = (...args: unknown[]) => {
  if (DEBUG) console.log("[qms]", ...args);
};

/* --- Types --------------------------------------------------------------- */

/**
 * - `online`    socket is live and the board reconciled recently.
 * - `degraded`  the socket is not delivering, but REST polling is keeping the
 *               board correct. The data is right, it just arrives a beat later.
 * - `offline`   nothing has reconciled recently — what's on screen may be stale.
 */
export type ConnectionStatus = "connecting" | "online" | "degraded" | "offline";

export interface QueueError {
  number: string | null;
  code: string;
  message: string;
}

export interface QueueApi {
  items: QueueItem[];
  status: ConnectionStatus;
  canUndo: boolean;
  chimeEnabled: boolean;
  /** Bumps each time the store's display is asked to replay the chime (remote). */
  chimeSignal: number;
  lastError: QueueError | null;
  /** ms to add to the device clock to get the server's clock (0 until calibrated). */
  clockOffset: number;
  scan: (raw: string) => Promise<boolean>;
  markReady: (number: string) => void;
  hold: (number: string) => void;
  collect: (number: string) => void;
  unready: (number: string) => void;
  clear: () => void;
  importItems: (items: QueueItem[]) => void;
  setChime: (on: boolean) => void;
  /** Ask every display in this store to sound the serve chime now. */
  requestChime: () => void;
  undo: () => void;
  clearError: () => void;
}

type BackendStatus = "PREPARING" | "SERVING" | "SERVED" | "ON_HOLD" | "CANCELLED";

interface BackendOrder {
  id: string;
  orderNumber: string;
  storeId: string;
  orderStatus: BackendStatus; // backend uses "orderStatus", not "status"
  createdAt: string;
  updatedAt: string;
}

/** Backend status → what the board shows. `null` means "off the board". */
const BOARD_STATUS: Record<BackendStatus, QueueStatus | null> = {
  PREPARING: "preparing",
  SERVING: "ready",
  ON_HOLD: "holding",
  SERVED: null, // collected
  CANCELLED: null,
};

function toItem(order: BackendOrder): QueueItem | null {
  const status = BOARD_STATUS[order.orderStatus];
  if (!status) return null;
  const stamp = status === "preparing" ? order.createdAt : order.updatedAt;
  return { id: order.id, number: order.orderNumber, status, since: parseServerTime(stamp) };
}

/** Stable identity for an order. Backend ids are always present in practice. */
const keyOf = (item: QueueItem): string => item.id ?? item.number;

function sameBoard(a: QueueItem[], b: QueueItem[]): boolean {
  if (a.length !== b.length) return false;
  const byKey = new Map(a.map((i) => [keyOf(i), i]));
  for (const item of b) {
    const prev = byKey.get(keyOf(item));
    if (!prev) return false;
    if (prev.status !== item.status || prev.number !== item.number) return false;
    // NaN === NaN is false; treat two unparseable stamps as equal.
    if (prev.since !== item.since && !(Number.isNaN(prev.since) && Number.isNaN(item.since))) {
      return false;
    }
  }
  return true;
}

interface Snapshot {
  items: QueueItem[];
  /** Device clock when the request left — anything changed locally after this wins. */
  takenAt: number;
}

async function fetchSnapshot(): Promise<Snapshot> {
  if (!STORE_ID) throw new Error("VITE_STORE_ID is not configured");
  const takenAt = Date.now();
  const json = await requestJson<{ data?: BackendOrder[] } | BackendOrder[]>(
    `${API_URL}/api/v1/orders/store/${STORE_ID}`,
  );
  const orders = Array.isArray(json) ? json : json?.data;
  // A malformed success response is a failed sync, not an empty queue.
  if (!Array.isArray(orders) || orders.some((order) =>
    !order || typeof order.id !== "string" || typeof order.orderNumber !== "string" ||
    // Fully Kiosk may run an older Android WebView without Object.hasOwn.
    // Throwing here rejects every snapshot that contains an order, leaving a
    // refreshed board empty while later socket events still appear.
    !Object.prototype.hasOwnProperty.call(BOARD_STATUS, order.orderStatus) ||
    !Number.isFinite(parseServerTime(order.createdAt)) ||
    !Number.isFinite(parseServerTime(order.updatedAt))
  )) throw new Error("Invalid queue response; keeping the previous board");
  const items = orders.map(toItem).filter((i): i is QueueItem => i !== null);
  // Order timestamps describe past activity, never the current server time.
  // Reusing them to calibrate the clock rewinds it on every unchanged poll.
  return { items, takenAt };
}

/**
 * A build without a store id can never work. Surfacing that as the initial
 * error — rather than discovering it inside an effect — means the screen says so
 * on its very first paint instead of sitting there blank and "Connected".
 */
const CONFIG_ERROR: QueueError | null = STORE_ID
  ? null
  : { number: null, code: "config_missing", message: "VITE_STORE_ID is not set in this build" };
const INITIAL_STATUS: ConnectionStatus = STORE_ID ? "connecting" : "offline";

export function useQueue(): QueueApi {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>(INITIAL_STATUS);
  const [lastError, setLastError] = useState<QueueError | null>(CONFIG_ERROR);
  const [chimeEnabled, setChimeEnabled] = useState(() => {
    try { return localStorage.getItem(CHIME_KEY) !== "false"; }
    catch { return true; }
  });
  const [chimeSignal, setChimeSignal] = useState(0);

  const socketRef = useRef<Socket | null>(null);

  // The board is held in a ref and mirrored into state. Socket handlers, the
  // reconcile poll and the optimistic actions all need to read the current board
  // and know whether their write actually changed it — a `setState` updater
  // can't answer that, because React decides when to run it.
  const boardRef = useRef<QueueItem[]>([]);
  const updateBoard = useCallback((fn: (prev: QueueItem[]) => QueueItem[]): boolean => {
    const next = fn(boardRef.current);
    if (next === boardRef.current) return false;
    boardRef.current = next;
    setItems(next);
    return true;
  }, []);

  // Device-clock stamp of the last local change to each order, keyed by id. A
  // snapshot that was *requested* before one of these must not roll it back —
  // that race is how an order could vanish from a screen seconds after it was
  // added and never come back.
  const touchedRef = useRef<Map<string, number>>(new Map());

  // Orders with a mutation still in flight. Their local state is authoritative
  // until the request settles, whatever a snapshot says in the meantime.
  const pendingRef = useRef<Set<string>>(new Set());

  // Health bookkeeping. All device-clock ms; 0 means "never" and is filled in
  // when the effect runs (reading the clock during render is not allowed).
  const mountedAtRef = useRef(0);
  const lastSocketContactRef = useRef(0);
  const lastSyncOkRef = useRef(0);
  const lastInputRef = useRef(0);
  const okStreakRef = useRef(0);
  const syncsSinceConnectRef = useRef(0);
  const socketMissesRef = useRef(0);
  /** When this screen last changed the board itself — see the miss detector. */
  const lastLocalActionRef = useRef(0);
  const statusRef = useRef<ConnectionStatus>(INITIAL_STATUS);
  const syncGenRef = useRef(0);
  const inFlightSyncRef = useRef<Promise<void> | null>(null);
  const requestSyncRef = useRef<(reason: string) => Promise<void>>(() => Promise.resolve());
  const rejoinRef = useRef<() => void>(() => {});

  // Server-clock calibration. Wait-time ages are measured against this
  // offset-corrected clock so every screen agrees even when a tablet's own clock
  // is wrong — which matters offline, where devices can't NTP-sync. Only the
  // explicit time:sync message or health response supplies current time. Order times
  // may be old, even in newly delivered events. Between time syncs, keep the last
  // offset and let the clock advance normally, including while disconnected.
  // Until the first time sync, use the device clock (offset 0).
  const [clockOffset, setClockOffset] = useState(0);
  const clockOffsetRef = useRef(0);
  const calibrate = useCallback((serverNowMs: number) => {
    if (!Number.isFinite(serverNowMs)) return;
    const offset = serverNowMs - Date.now();
    if (Math.abs(offset - clockOffsetRef.current) < 1000) return; // ignore sub-second jitter
    clockOffsetRef.current = offset;
    setClockOffset(offset);
  }, []);

  /**
   * Fold a backend snapshot into the board.
   *
   * The backend is the source of truth, with one exception: anything changed
   * locally after the snapshot was requested is newer than the snapshot and is
   * kept. Returns true when the board actually moved — the caller uses that to
   * notice the socket failed to deliver something it should have.
   */
  const applySnapshot = useCallback(
    (snap: Snapshot): boolean =>
      updateBoard((prev) => {
        const touched = touchedRef.current;
        // Local state wins over the snapshot in two cases: it changed after the
        // snapshot was requested, or a mutation for it is still in flight. The
        // second matters because a slow PATCH would otherwise let a poll roll the
        // optimistic change back for a beat before the confirmation flips it
        // forward again — a visible flicker on exactly the action staff just took.
        const isPinned = (key: string) =>
          pendingRef.current.has(key) || (touched.get(key) ?? 0) > snap.takenAt;

        const next: QueueItem[] = [];
        const seen = new Set<string>();
        const prevByKey = new Map(prev.map((i) => [keyOf(i), i]));

        for (const item of snap.items) {
          const key = keyOf(item);
          seen.add(key);
          const local = prevByKey.get(key);
          // An optimistic collect/cancel removes the item. Its absence is also
          // pinned while the write is pending or this snapshot predates it.
          if (!local && isPinned(key)) continue;
          next.push(local && isPinned(key) ? local : item);
        }

        // Orders the backend no longer lists have been collected or cancelled —
        // drop them, unless they only just changed here and the snapshot
        // predates that change.
        for (const local of prev) {
          const key = keyOf(local);
          if (seen.has(key)) continue;
          if (isPinned(key)) next.push(local);
        }

        // Stop tracking orders that have left the board entirely.
        const live = new Set(next.map(keyOf));
        for (const key of [...touched.keys()]) {
          if (!live.has(key) && !isPinned(key)) touched.delete(key);
        }

        return sameBoard(prev, next) ? prev : next;
      }),
    [updateBoard],
  );

  /** Recompute the public status from *data* health, not just socket state. */
  const refreshStatus = useCallback(() => {
    const now = Date.now();
    const socket = socketRef.current;
    const socketHealthy =
      !!socket?.connected && now - lastSocketContactRef.current < SOCKET_SILENCE_MS;
    const boardFresh = lastSyncOkRef.current > 0 && now - lastSyncOkRef.current < STALE_AFTER_MS;
    const mountedAt = mountedAtRef.current || now;
    const settling = lastSyncOkRef.current === 0 && now - mountedAt < STALE_AFTER_MS;

    let next: ConnectionStatus;
    if (!STORE_ID) next = "offline";
    else if (boardFresh) next = socketHealthy ? "online" : "degraded";
    else next = settling ? "connecting" : "offline";

    if (next === statusRef.current) return;
    statusRef.current = next;
    setConnStatus(next);
  }, []);

  /* --- Wiring ------------------------------------------------------------ */

  useEffect(() => {
    mountedAtRef.current = Date.now();
    lastInputRef.current = Date.now();

    if (!STORE_ID) {
      // Already reflected in the initial state (CONFIG_ERROR / INITIAL_STATUS);
      // nothing to connect to, so don't start a socket or a poll.
      warn("VITE_STORE_ID is not set — this build cannot talk to a store.");
      return;
    }

    let disposed = false;
    let pollTimer = 0;

    /* ---- Socket ---------------------------------------------------------- */

    const socket: Socket = io(`${API_URL}/orders`, {
      transports: ["polling", "websocket"], // polling first so the HTTP handshake establishes a session before the WS upgrade
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
      randomizationFactor: 0.5,
      timeout: 10_000,
    });
    socketRef.current = socket;

    const markSocketAlive = () => {
      lastSocketContactRef.current = Date.now();
    };

    const forceReconnect = (reason: string) => {
      note("forcing socket reconnect:", reason);
      // Reset the liveness clock first so the watchdog doesn't re-trigger while
      // the replacement connection is still being established.
      lastSocketContactRef.current = Date.now();
      syncsSinceConnectRef.current = 0;
      socketMissesRef.current = 0;
      try {
        socket.disconnect();
      } catch {
        /* already down */
      }
      socket.connect();
    };

    const joinStore = () => {
      trace("joining store room:", STORE_ID);
      // The ack is a bonus signal, not a requirement: a backend that doesn't
      // acknowledge simply times out here, and the reconcile poll covers us
      // either way. A missing ack must never be treated as fatal.
      socket.timeout(JOIN_ACK_MS).emit("join-store", { storeId: STORE_ID }, (err: Error | null) => {
        if (err) trace("join-store not acknowledged (older backend?) — polling covers it");
        else trace("join-store acknowledged");
      });
    };
    rejoinRef.current = joinStore;

    /* ---- Reconciliation poll ---------------------------------------------
     * This is the safety net that makes every other failure survivable. The
     * socket is only an accelerator now: even with a completely dead socket the
     * board stays correct, which is what removes the need to reboot a device.
     */
    const doSync = async (reason: string): Promise<void> => {
      const gen = (syncGenRef.current += 1);
      try {
        const snap = await fetchSnapshot();
        if (disposed || gen !== syncGenRef.current) return; // superseded by a newer sync
        lastSyncOkRef.current = Date.now();
        okStreakRef.current += 1;

        const changed = applySnapshot(snap);
        syncsSinceConnectRef.current += 1;

        // A poll that found news while the socket claims to be connected means
        // the socket is not delivering — most likely the store room was never
        // joined, or was lost on the backend. Rejoin; if it keeps happening,
        // tear the connection down and build a fresh one.
        //
        // Our own actions don't count: every staff tap applies optimistically
        // and then resyncs, and the backend's authoritative timestamp lands on
        // that snapshot. That's a change we caused, not one the socket dropped.
        const ownDoing = snap.takenAt - lastLocalActionRef.current < LOCAL_ACTION_QUIET_MS;
        if (changed && !ownDoing && socket.connected && syncsSinceConnectRef.current > 1) {
          socketMissesRef.current += 1;
          warn(`socket connected but missed an update (${socketMissesRef.current}) — rejoining`);
          rejoinRef.current();
          if (socketMissesRef.current >= 2) forceReconnect("missed updates twice");
        }

        // A long healthy streak means whatever we recovered from is behind us.
        if (okStreakRef.current === 5) {
          try {
            sessionStorage.removeItem(RELOAD_COUNT_KEY);
          } catch {
            /* private mode — nothing to clear */
          }
        }
        trace("sync ok", reason, `${snap.items.length} orders`, changed ? "(changed)" : "");
      } catch (err) {
        if (disposed) return;
        okStreakRef.current = 0;
        // Never blank the board because a poll failed. Keeping the last known
        // good state is always better than showing an empty queue, which staff
        // and customers read as "nothing is being prepared".
        const detail = isRequestFailure(err)
          ? `${err.status === 0 ? "network" : `HTTP ${err.status}`} — ${err.message}`
          : String(err);
        warn(`sync failed (${reason}), keeping last known board:`, detail);
      } finally {
        if (!disposed) refreshStatus();
      }
    };

    const requestSync = (reason: string): Promise<void> => {
      if (inFlightSyncRef.current) return inFlightSyncRef.current;
      const run = doSync(reason).finally(() => {
        inFlightSyncRef.current = null;
      });
      inFlightSyncRef.current = run;
      return run;
    };
    requestSyncRef.current = requestSync;

    const schedulePoll = () => {
      window.clearTimeout(pollTimer);
      if (disposed) return;
      const delay = statusRef.current === "online" ? SYNC_INTERVAL_MS : SYNC_INTERVAL_DEGRADED_MS;
      pollTimer = window.setTimeout(() => {
        void requestSync("poll").finally(schedulePoll);
      }, delay);
    };

    /* ---- Socket events --------------------------------------------------- */

    // engine.io pings us every ~25s. That heartbeat — not our own timers — is
    // the honest signal that the transport is still carrying traffic, and it is
    // what lets us spot a half-open socket left behind by a Wi-Fi roam.
    const onManagerPing = () => markSocketAlive();
    const onReconnectAttempt = (n: number) => trace("reconnect attempt", n);
    socket.io.on("ping", onManagerPing);
    socket.io.on("reconnect_attempt", onReconnectAttempt);

    socket.on("time:sync", (data: { now?: number }) => {
      if (typeof data?.now === "number") calibrate(data.now);
    });

    socket.on("connect", () => {
      note("socket connected, id:", socket.id);
      markSocketAlive();
      syncsSinceConnectRef.current = 0;
      socketMissesRef.current = 0;
      socket.emit("time:request");
      joinStore();
      void requestSync("connect");
      refreshStatus();
    });

    socket.on("disconnect", (reason) => {
      note("socket disconnected:", reason);
      refreshStatus();
      schedulePoll(); // fall back to the faster degraded poll immediately
      // "io server disconnect" is the one case socket.io will not retry itself.
      if (reason === "io server disconnect") socket.connect();
    });

    socket.on("connect_error", (err) => {
      warn("connect_error:", err.message);
      refreshStatus();
    });

    socket.onAny((event: string, ...args: unknown[]) => {
      // Any inbound packet proves the transport is alive — but not that we are
      // in the store room. Only order events prove that, so they alone clear the
      // miss counter below; time:sync is a direct reply and would mask the fault.
      markSocketAlive();
      trace("event:", event, args);
    });

    socket.on("order:created", (order: BackendOrder) => {
      trace("order:created", order);
      socketMissesRef.current = 0; // the room is delivering
      const item = toItem(order);
      if (!item) return;
      touchedRef.current.set(keyOf(item), Date.now());
      updateBoard((prev) => (prev.some((i) => keyOf(i) === keyOf(item)) ? prev : [...prev, item]));
    });

    socket.on("order:status-updated", (order: BackendOrder) => {
      trace("order:status-updated", order);
      socketMissesRef.current = 0; // the room is delivering
      touchedRef.current.set(order.id, Date.now());
      const item = toItem(order);
      updateBoard((prev) => {
        if (!item) {
          const without = prev.filter((i) => keyOf(i) !== order.id);
          return without.length === prev.length ? prev : without;
        }
        const idx = prev.findIndex((i) => keyOf(i) === keyOf(item));
        if (idx === -1) return [...prev, item];
        const next = [...prev];
        next[idx] = item;
        return next;
      });
    });

    // A tablet asked the store's displays to re-sound the chime. Bump a counter
    // so the display screen can react; the value itself is meaningless.
    socket.on("chime:play", () => {
      trace("chime:play");
      setChimeSignal((n) => n + 1);
    });

    /* ---- Watchdog -------------------------------------------------------- */

    const readReloadCount = (): number => {
      try {
        return Number(sessionStorage.getItem(RELOAD_COUNT_KEY) ?? "0") || 0;
      } catch {
        return 0;
      }
    };

    let recoveryProbePending = false;
    let lastRecoveryProbe = 0;
    const recoveryReload = async (attempts: number) => {
      if (recoveryProbePending || Date.now() - lastRecoveryProbe < 30_000) return;
      recoveryProbePending = true;
      lastRecoveryProbe = Date.now();
      try {
        // Plain LAN HTTP has no service-worker offline shell. Do not navigate
        // away from a visible board into a browser error while the LAN is down.
        await requestVoid(`/index.html?recovery=${Date.now()}`, {}, 5_000);
        if (disposed || statusRef.current !== "offline" || isReloadBlocked() ||
          Date.now() - lastInputRef.current < RECENT_INPUT_MS) return;
        try {
          sessionStorage.setItem(RELOAD_COUNT_KEY, String(attempts + 1));
        } catch {
          /* private mode — reload without the backoff memory */
        }
        warn(`unreachable for too long — reloading (recovery attempt ${attempts + 1})`);
        window.location.reload();
      } catch {
        // Keep the visible board and retry while the frontend is unreachable.
      } finally {
        recoveryProbePending = false;
      }
    };

    const tick = () => {
      if (disposed) return;
      const now = Date.now();
      const silentFor = now - lastSocketContactRef.current;

      if (socket.connected && silentFor > SOCKET_SILENCE_MS) {
        // Connected on paper, silent in practice: the classic half-open socket a
        // sleeping tablet or a Wi-Fi roam leaves behind. socket.io can't see it
        // because its own timers were throttled along with everything else.
        forceReconnect(`no traffic for ${Math.round(silentFor / 1000)}s`);
      } else if (!socket.connected && !socket.active) {
        // socket.io has given up entirely (e.g. a namespace-level rejection).
        note("socket idle and not retrying — reconnecting");
        socket.connect();
      }

      refreshStatus();

      // Last resort for a truly empty, disconnected screen. A failed snapshot
      // must never make us reload away orders that are still visible, or orders
      // arriving over a live socket. Both cases are safer left on screen while
      // the poll keeps trying to recover.
      if (statusRef.current !== "offline") return;
      if (boardRef.current.length > 0) return;
      if (socket.connected && now - lastSocketContactRef.current < SOCKET_SILENCE_MS) return;
      if (now - lastInputRef.current < RECENT_INPUT_MS || isReloadBlocked()) return;
      const deadFor = now - Math.max(lastSyncOkRef.current, mountedAtRef.current);
      const attempts = readReloadCount();
      if (deadFor > RECOVERY_RELOAD_MS * Math.min(attempts + 1, 6)) void recoveryReload(attempts);
    };

    const watchdog = window.setInterval(tick, WATCHDOG_INTERVAL_MS);

    // Asking for the time keeps the clock fresh and gives the server a reason to
    // send us something, which in turn feeds the liveness check.
    let timeRequestPending = false;
    const syncTime = () => {
      if (socket.connected) {
        socket.emit("time:request");
        return;
      }
      // LAN HTTP fallback: a cold boot with a broken socket must still learn
      // the mini PC's time. This endpoint already returns an explicit `now`.
      if (timeRequestPending) return;
      timeRequestPending = true;
      void requestJson<{ now?: number }>(`${API_URL}/api/v1/health`)
        .then((health) => {
          if (!disposed && typeof health?.now === "number") calibrate(health.now);
        })
        .catch(() => { /* retain the last calibration while unreachable */ })
        .finally(() => { timeRequestPending = false; });
    };
    const timeResync = window.setInterval(syncTime, 60_000);
    syncTime();

    /* ---- Wake-up hooks ---------------------------------------------------
     * Timers are throttled hard in a backgrounded Android WebView, so when the
     * screen or the network comes back the right move is to check by hand rather
     * than wait for a tick that may be minutes late.
     */
    const wake = (why: string) => {
      if (disposed) return;
      trace("wake:", why);
      tick();
      void requestSync(why);
      schedulePoll();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") wake("visible");
    };
    const onOnline = () => wake("online");
    const onFocus = () => wake("focus");
    const onPageShow = () => wake("pageshow");
    const onInput = () => {
      lastInputRef.current = Date.now();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pointerdown", onInput, { passive: true, capture: true });
    window.addEventListener("keydown", onInput, { passive: true, capture: true });

    // Load the board immediately rather than waiting for the socket to come up.
    // If the backend is reachable but the socket isn't, the screen still works.
    void requestSync("mount");
    schedulePoll();

    return () => {
      disposed = true;
      window.clearInterval(watchdog);
      window.clearInterval(timeResync);
      window.clearTimeout(pollTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pointerdown", onInput, true);
      window.removeEventListener("keydown", onInput, true);
      socket.io.off("ping", onManagerPing);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.offAny();
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      requestSyncRef.current = () => Promise.resolve();
    };
  }, [applySnapshot, calibrate, refreshStatus, updateBoard]);

  /* --- Actions ----------------------------------------------------------- */

  const findItem = (number: string) => boardRef.current.find((i) => i.number === number);

  const reportError = (number: string | null, code: string, err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    setLastError({ number, code, message });
  };

  /** Nudge the board back into agreement with the backend right now. */
  const resync = useCallback((reason: string) => {
    void requestSyncRef.current(reason);
  }, []);

  /**
   * Apply a status change locally before the backend confirms it. Two reasons:
   * the tablet feels instant, and — more importantly — the action still shows up
   * on the screen that issued it even when that screen's socket is dead. The
   * `touched` stamp stops an in-flight snapshot from undoing it.
   */
  const applyLocal = useCallback(
    (id: string, status: QueueStatus | null) => {
      const now = Date.now();
      touchedRef.current.set(id, now);
      lastLocalActionRef.current = now;
      updateBoard((prev) => {
        if (status === null) {
          const without = prev.filter((i) => keyOf(i) !== id);
          return without.length === prev.length ? prev : without;
        }
        const idx = prev.findIndex((i) => keyOf(i) === id);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], status, since: now + clockOffsetRef.current };
        return next;
      });
    },
    [updateBoard],
  );

  const patch = useCallback(
    (number: string, status: BackendStatus, errorCode: string) => {
      const item = findItem(number);
      if (!item?.id) return;
      const id = item.id;
      applyLocal(id, BOARD_STATUS[status]);
      pendingRef.current.add(id);
      // PATCH sets an absolute status, so repeating it is harmless — retrying
      // through a Wi-Fi blip is strictly better than dropping a staff action.
      withRetry(
        () =>
          requestVoid(
            `${API_URL}/api/v1/orders/${id}/status`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status }),
            },
            MUTATION_TIMEOUT_MS,
          ),
        MUTATION_TRIES,
      )
        .catch((err) => {
          reportError(number, errorCode, err);
          touchedRef.current.delete(id); // let the next snapshot undo the optimistic change
        })
        .finally(() => {
          pendingRef.current.delete(id);
          resync(`after:${errorCode}`);
        });
    },
    [applyLocal, resync],
  );

  const scan = useCallback(
    async (raw: string): Promise<boolean> => {
      const number = extractNumber(raw);
      if (!number) {
        setLastError({ number: null, code: "invalid_scan", message: "Could not read a number" });
        return false;
      }
      if (!STORE_ID) {
        setLastError({
          number,
          code: "config_missing",
          message: "VITE_STORE_ID is not set in this build",
        });
        return false;
      }

      // Creating is not idempotent, so it is deliberately not wrapped in
      // withRetry. Instead: if the request never reached the server, retry it
      // exactly once and treat a 409 on that retry as success — a duplicate
      // there means the first attempt did land after all.
      const create = () =>
        requestVoid(
          `${API_URL}/api/v1/orders`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderNumber: number, storeId: STORE_ID }),
          },
          MUTATION_TIMEOUT_MS,
        );

      try {
        try {
          await create();
        } catch (err) {
          if (!isRequestFailure(err) || !err.transport) throw err;
          warn(`create ${number} never reached the server — retrying once`);
          try {
            await create();
          } catch (retryErr) {
            if (isRequestFailure(retryErr) && retryErr.status === 409) {
              note(`create ${number} had in fact landed — treating as success`);
            } else {
              throw retryErr;
            }
          }
        }
        // The order this created will show up on the next snapshot; that's our
        // own doing, not a socket the miss detector should blame.
        lastLocalActionRef.current = Date.now();
        resync("after:create");
        return true;
      } catch (err) {
        if (isRequestFailure(err) && err.status === 409) {
          // Branch the message on what's actually on the board: an active order
          // staff can see, vs. a number the backend still knows but isn't shown.
          const existing = findItem(number);
          setLastError({
            number,
            code: existing ? `dup_${existing.status}` : "dup_used",
            message: "",
          });
        } else {
          reportError(number, "scan_failed", err);
        }
        resync("after:create-failed");
        return false;
      }
    },
    [resync],
  );

  const markReady = useCallback((n: string) => patch(n, "SERVING", "serve_failed"), [patch]);
  const hold = useCallback((n: string) => patch(n, "ON_HOLD", "hold_failed"), [patch]);
  const collect = useCallback((n: string) => patch(n, "SERVED", "collect_failed"), [patch]);
  const unready = useCallback((n: string) => patch(n, "PREPARING", "unready_failed"), [patch]);

  const clear = useCallback(() => {
    const ids = boardRef.current.map((i) => i.id).filter((id): id is string => !!id);
    if (ids.length === 0) return;
    ids.forEach((id) => {
      applyLocal(id, null);
      pendingRef.current.add(id);
    });
    Promise.allSettled(
      ids.map((id) =>
        withRetry(
          () =>
            requestVoid(
              `${API_URL}/api/v1/orders/${id}/status`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "CANCELLED" }),
              },
              MUTATION_TIMEOUT_MS,
            ),
          MUTATION_TRIES,
        ),
      ),
    )
      .then((results) => {
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          setLastError({
            number: null,
            code: "clear_failed",
            message: `${failed} of ${ids.length} orders could not be cleared`,
          });
          ids.forEach((id) => touchedRef.current.delete(id));
        }
      })
      .finally(() => {
        ids.forEach((id) => pendingRef.current.delete(id));
        resync("after:clear");
      });
  }, [applyLocal, resync]);

  const importItems = useCallback(() => {
    // Not supported — the backend is the source of truth.
    setLastError({ number: null, code: "not_supported", message: "CSV import is not available" });
  }, []);

  const setChime = useCallback((on: boolean) => {
    setChimeEnabled(on);
    try { localStorage.setItem(CHIME_KEY, String(on)); }
    catch { /* keep the in-memory preference when storage is unavailable */ }
  }, []);

  const requestChime = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      // The chime only travels over the socket, so unlike every other action it
      // has no REST fallback. Say so rather than silently doing nothing.
      setLastError({
        number: null,
        code: "chime_offline",
        message: "Not connected to the display right now",
      });
      return;
    }
    socket.emit("chime:replay", { storeId: STORE_ID });
  }, []);

  const undo = useCallback(() => {
    // No backend undo support.
  }, []);

  const clearError = useCallback(() => setLastError(null), []);

  return {
    items,
    status: connStatus,
    canUndo: false,
    chimeEnabled,
    chimeSignal,
    lastError,
    clockOffset,
    scan,
    markReady,
    hold,
    collect,
    unready,
    clear,
    importItems,
    setChime,
    requestChime,
    undo,
    clearError,
  };
}
