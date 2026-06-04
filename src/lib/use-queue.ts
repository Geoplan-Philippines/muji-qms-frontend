import { useCallback, useEffect, useRef, useState } from "react";
import {
  STORAGE_KEY,
  WS_PORT,
  type Action,
  type QueueItem,
  type ReduceError,
  type ServerMessage,
} from "../../shared/qms.ts";

export type ConnectionStatus = "connecting" | "online" | "offline";

export interface QueueError {
  id: number;
  error: ReduceError;
  number: string | null;
  forType: Action["type"];
}

export interface QueueApi {
  items: QueueItem[];
  status: ConnectionStatus;
  canUndo: boolean;
  lastError: QueueError | null;
  scan: (raw: string) => void;
  markReady: (value: string) => void;
  undo: () => void;
  clearError: () => void;
}

const RECONNECT_MIN = 500;
const RECONNECT_MAX = 5000;

function wsUrl(): string {
  const host = window.location.hostname || "localhost";
  return `ws://${host}:${WS_PORT}`;
}

function loadCache(): QueueItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { items?: QueueItem[] };
    return parsed.items ?? [];
  } catch {
    return [];
  }
}

/**
 * Connects to the local sync server, exposes the live board, and sends
 * actions. The server is authoritative; we cache its last snapshot in
 * localStorage so a refreshed screen paints instantly before the socket
 * reopens, and we buffer outgoing actions while offline.
 */
export function useQueue(): QueueApi {
  const [items, setItems] = useState<QueueItem[]>(loadCache);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [canUndo, setCanUndo] = useState(false);
  const [lastError, setLastError] = useState<QueueError | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const outboxRef = useRef<Action[]>([]);
  const lastSeqRef = useRef<number>(-1);
  const reconnectRef = useRef<number>(RECONNECT_MIN);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorIdRef = useRef(0);
  const closedRef = useRef(false);

  const send = useCallback((action: Action) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(action));
    } else {
      outboxRef.current.push(action);
    }
  }, []);

  useEffect(() => {
    closedRef.current = false;

    const connect = () => {
      setStatus((prev) => (prev === "online" ? prev : "connecting"));
      let socket: WebSocket;
      try {
        socket = new WebSocket(wsUrl());
      } catch {
        scheduleReconnect();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectRef.current = RECONNECT_MIN;
        setStatus("online");
        const pending = outboxRef.current;
        outboxRef.current = [];
        for (const action of pending) socket.send(JSON.stringify(action));
      };

      socket.onmessage = (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(event.data as string) as ServerMessage;
        } catch {
          return;
        }
        if (message.type === "snapshot") {
          if (message.seq < lastSeqRef.current) return; // drop stale frames
          lastSeqRef.current = message.seq;
          setItems(message.items);
          setCanUndo(message.canUndo);
          try {
            window.localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({ items: message.items, seq: message.seq }),
            );
          } catch {
            /* storage full or unavailable: the live socket still works */
          }
        } else if (message.type === "error") {
          errorIdRef.current += 1;
          setLastError({
            id: errorIdRef.current,
            error: message.error,
            number: message.number,
            forType: message.forType,
          });
        }
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (!closedRef.current) scheduleReconnect();
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    const scheduleReconnect = () => {
      if (closedRef.current) return;
      setStatus("offline");
      const delay = reconnectRef.current;
      reconnectRef.current = Math.min(RECONNECT_MAX, Math.round(delay * 1.6));
      timerRef.current = setTimeout(connect, delay);
    };

    connect();

    return () => {
      closedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const scan = useCallback((raw: string) => send({ type: "scan", raw }), [send]);
  const markReady = useCallback(
    (value: string) => send({ type: "ready", number: value }),
    [send],
  );
  const undo = useCallback(() => send({ type: "undo" }), [send]);
  const clearError = useCallback(() => setLastError(null), []);

  return { items, status, canUndo, lastError, scan, markReady, undo, clearError };
}
