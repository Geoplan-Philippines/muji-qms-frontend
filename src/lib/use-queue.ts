import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { extractNumber, parseServerTime, type QueueItem } from "../../shared/qms.ts";

const API_URL =
  ((import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000").replace(
    /\/$/,
    "",
  );
const STORE_ID = import.meta.env.VITE_STORE_ID as string | undefined;
const CHIME_KEY = "muji-qms:chime";

export type ConnectionStatus = "connecting" | "online" | "offline";

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

function toItem(order: BackendOrder): QueueItem | null {
  switch (order.orderStatus) {
    case "PREPARING":
      return { id: order.id, number: order.orderNumber, status: "preparing", since: parseServerTime(order.createdAt) };
    case "SERVING":
      return { id: order.id, number: order.orderNumber, status: "ready", since: parseServerTime(order.updatedAt) };
    case "ON_HOLD":
      return { id: order.id, number: order.orderNumber, status: "holding", since: parseServerTime(order.updatedAt) };
    default:
      return null; // SERVED (done/collected) and CANCELLED — remove from board
  }
}

async function apiPatch(id: string, status: BackendStatus): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/orders/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function apiCreateOrder(orderNumber: string): Promise<void> {
  if (!STORE_ID) {
    console.warn("[use-queue] VITE_STORE_ID is not set — cannot create order");
    return;
  }
  const res = await fetch(`${API_URL}/api/v1/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderNumber, storeId: STORE_ID }),
  });
  if (!res.ok) {
    if (res.status === 409) {
      throw Object.assign(new Error("already_exists"), { code: "already_exists" });
    }
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) msg = body.message;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
}

async function fetchStoreOrders(): Promise<QueueItem[]> {
  if (!STORE_ID) return [];
  const res = await fetch(`${API_URL}/api/v1/orders/store/${STORE_ID}`);
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: BackendOrder[] } | BackendOrder[];
  const orders: BackendOrder[] = Array.isArray(json) ? json : (json.data ?? []);
  return orders.map(toItem).filter((i): i is QueueItem => i !== null);
}

export function useQueue(): QueueApi {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("connecting");
  const [lastError, setLastError] = useState<QueueError | null>(null);
  const [chimeEnabled, setChimeEnabled] = useState(
    () => localStorage.getItem(CHIME_KEY) !== "false",
  );
  const [chimeSignal, setChimeSignal] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const itemsRef = useRef<QueueItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Server-clock calibration. Wait-time ages are measured against this
  // offset-corrected clock so every screen agrees even when a tablet's own clock
  // is wrong — which matters offline, where devices can't NTP-sync. We learn the
  // offset purely from the backend's own order timestamps: the createdAt /
  // updatedAt that ride along on every order event, each ≈ "server now" at the
  // moment it happened. Because the displayed age is then the difference between
  // two values parsed the SAME way by parseServerTime, it stays correct no matter
  // how the backend formats or zones its timestamps (any constant parse offset
  // cancels). Until the first event the offset is 0 — i.e. the raw device clock.
  const [clockOffset, setClockOffset] = useState(0);
  const clockOffsetRef = useRef(0);
  const calibrate = useCallback((serverNowMs: number) => {
    if (!Number.isFinite(serverNowMs)) return;
    const offset = serverNowMs - Date.now();
    if (Math.abs(offset - clockOffsetRef.current) < 1000) return; // ignore sub-second jitter
    clockOffsetRef.current = offset;
    setClockOffset(offset);
  }, []);

  useEffect(() => {
    const socket: Socket = io(`${API_URL}/orders`, {
      transports: ["polling", "websocket"], // polling first so HTTP handshake establishes session before WS upgrade
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[qms] socket connected, id:", socket.id);
      setConnStatus("online");
      if (STORE_ID) {
        console.log("[qms] joining store room:", STORE_ID);
        socket.emit("join-store", { storeId: STORE_ID });
      } else {
        console.warn("[qms] VITE_STORE_ID is not set — no store room joined");
      }
      fetchStoreOrders()
        .then((orders) => {
          console.log("[qms] initial fetch:", orders.length, "orders");
          setItems(orders);
        })
        .catch((err) => console.error("[qms] initial fetch failed:", err));
    });

    socket.on("disconnect", (reason) => {
      console.log("[qms] socket disconnected:", reason);
      setConnStatus("offline");
    });

    socket.on("connect_error", (err) => {
      console.error("[qms] connect_error:", err.message);
      setConnStatus("offline");
    });

    // Catch-all: logs ANY event from the server to diagnose missing handlers
    socket.onAny((event: string, ...args: unknown[]) => {
      console.log("[qms] event received:", event, args);
    });

    socket.on("order:created", (order: BackendOrder) => {
      console.log("[qms] order:created", order);
      calibrate(parseServerTime(order.createdAt));
      const item = toItem(order);
      if (!item) return;
      setItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]));
    });

    // A tablet asked the store's displays to re-sound the chime. Bump a counter
    // so the display screen can react; the value itself is meaningless.
    socket.on("chime:play", () => {
      console.log("[qms] chime:play");
      setChimeSignal((n) => n + 1);
    });

    socket.on("order:status-updated", (order: BackendOrder) => {
      console.log("[qms] order:status-updated", order);
      calibrate(parseServerTime(order.updatedAt));
      const item = toItem(order);
      if (!item) {
        setItems((prev) => prev.filter((i) => i.id !== order.id));
        return;
      }
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.id === item.id);
        if (idx === -1) return [...prev, item];
        const next = [...prev];
        next[idx] = item;
        return next;
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const findItem = (number: string) => itemsRef.current.find((i) => i.number === number);

  const reportError = (number: string | null, code: string, err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    setLastError({ number, code, message });
  };

  const scan = useCallback(async (raw: string): Promise<boolean> => {
    const number = extractNumber(raw);
    if (!number) {
      setLastError({ number: null, code: "invalid_scan", message: "Could not read a number" });
      return false;
    }
    try {
      await apiCreateOrder(number);
      return true;
    } catch (err) {
      if ((err as { code?: string }).code === "already_exists") {
        // Branch the message on what's actually on the board: an active order
        // staff can see, vs. a number the backend still knows but isn't shown.
        const existing = findItem(number);
        setLastError({ number, code: existing ? `dup_${existing.status}` : "dup_used", message: "" });
      } else {
        reportError(number, "scan_failed", err);
      }
      return false;
    }
  }, []);

  const markReady = useCallback((number: string) => {
    const item = findItem(number);
    if (!item?.id) return;
    apiPatch(item.id, "SERVING").catch((err) => reportError(number, "serve_failed", err));
  }, []);

  const hold = useCallback((number: string) => {
    const item = findItem(number);
    if (!item?.id) return;
    apiPatch(item.id, "ON_HOLD").catch((err) => reportError(number, "hold_failed", err));
  }, []);

  const collect = useCallback((number: string) => {
    const item = findItem(number);
    if (!item?.id) return;
    apiPatch(item.id, "SERVED").catch((err) => reportError(number, "collect_failed", err));
  }, []);

  const unready = useCallback((number: string) => {
    const item = findItem(number);
    if (!item?.id) return;
    apiPatch(item.id, "PREPARING").catch((err) => reportError(number, "unready_failed", err));
  }, []);

  const clear = useCallback(() => {
    Promise.all(itemsRef.current.filter((i) => i.id).map((i) => apiPatch(i.id!, "CANCELLED"))).catch(
      () => {},
    );
  }, []);

  const importItems = useCallback(() => {
    // Not supported — the backend is the source of truth.
    setLastError({ number: null, code: "not_supported", message: "CSV import is not available" });
  }, []);

  const setChime = useCallback((on: boolean) => {
    setChimeEnabled(on);
    localStorage.setItem(CHIME_KEY, String(on));
  }, []);

  const requestChime = useCallback(() => {
    socketRef.current?.emit("chime:replay", { storeId: STORE_ID });
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
