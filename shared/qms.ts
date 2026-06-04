/**
 * muji-qms shared queue logic.
 *
 * Single source of truth for the queue model, the reducer, and the wire
 * protocol. Imported by both the WebSocket server (Node, via native type
 * stripping) and the React client (Vite). Keep this file pure: no DOM, no
 * Node APIs, no enums/namespaces (erasable syntax only).
 */

/** WebSocket port the local sync server listens on. */
export const WS_PORT = 8787;

/**
 * Safety-net auto-clear: a served number drops off the board this long after
 * being marked served, in case staff forget to clear it. The primary removal
 * is the explicit "collect" (picked up) action.
 */
export const EXPIRE_MS = 300_000;

/** A queue number is the last N digits of a scanned/typed receipt barcode. */
export const LAST_DIGITS = 4;

/** localStorage key the client uses to cache the last snapshot for instant paint. */
export const STORAGE_KEY = "muji-qms.snapshot.v1";

export type QueueStatus = "preparing" | "ready";

export interface QueueItem {
  number: string; // zero-padded, LAST_DIGITS wide, e.g. "0042"
  status: QueueStatus;
  since: number; // epoch ms the item entered its current status
}

export interface QueueState {
  items: QueueItem[];
  undo: { items: QueueItem[] } | null; // one level of undo for manual actions
  seq: number; // monotonic, lets clients drop stale snapshots
}

export type Action =
  | { type: "scan"; raw: string }
  | { type: "ready"; number: string }
  | { type: "collect"; number: string }
  | { type: "clear" }
  | { type: "import"; items: QueueItem[] }
  | { type: "undo" }
  | { type: "expire" };

export type ReduceError =
  | "invalid_scan"
  | "invalid_number"
  | "already_preparing"
  | "already_ready"
  | "not_found"
  | "not_ready"
  | "nothing_to_undo"
  | "noop"
  | "unknown_action";

export interface ReduceResult {
  state: QueueState;
  ok: boolean;
  error?: ReduceError;
  number?: string;
}

export type ServerMessage =
  | {
      type: "snapshot";
      items: QueueItem[];
      seq: number;
      canUndo: boolean;
      serverTime: number;
    }
  | {
      type: "error";
      error: ReduceError;
      number: string | null;
      forType: Action["type"];
    };

export function makeInitialState(): QueueState {
  return { items: [], undo: null, seq: 0 };
}

/** Zero-pad a raw value's last LAST_DIGITS digits, or null if it has none. */
export function extractNumber(raw: string): string | null {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 1) return null;
  return digits.slice(-LAST_DIGITS).padStart(LAST_DIGITS, "0");
}

function snapshotItems(state: QueueState): { items: QueueItem[] } {
  return { items: state.items.map((i) => ({ ...i })) };
}

/**
 * The one authoritative state transition. The server owns the canonical
 * state and runs this; the client may run it optimistically but always
 * defers to the next server snapshot.
 */
export function reduce(
  state: QueueState,
  action: Action,
  now: number,
): ReduceResult {
  switch (action.type) {
    case "scan": {
      const number = extractNumber(action.raw);
      if (!number) return { state, ok: false, error: "invalid_scan" };
      const existing = state.items.find((i) => i.number === number);
      if (existing) {
        return {
          state,
          ok: false,
          error:
            existing.status === "preparing" ? "already_preparing" : "already_ready",
          number,
        };
      }
      const items = [...state.items, { number, status: "preparing" as const, since: now }];
      return { state: { items, undo: snapshotItems(state), seq: state.seq + 1 }, ok: true, number };
    }

    case "ready": {
      const number = extractNumber(action.number);
      if (!number) return { state, ok: false, error: "invalid_number" };
      const target = state.items.find((i) => i.number === number);
      if (!target) return { state, ok: false, error: "not_found", number };
      if (target.status === "ready") return { state, ok: false, error: "already_ready", number };
      const items = state.items.map((i) =>
        i.number === number ? { ...i, status: "ready" as const, since: now } : i,
      );
      return { state: { items, undo: snapshotItems(state), seq: state.seq + 1 }, ok: true, number };
    }

    case "collect": {
      const number = extractNumber(action.number);
      if (!number) return { state, ok: false, error: "invalid_number" };
      const target = state.items.find((i) => i.number === number);
      if (!target) return { state, ok: false, error: "not_found", number };
      // Only a served order can be collected; a preparing one isn't ready yet.
      if (target.status !== "ready") return { state, ok: false, error: "not_ready", number };
      const items = state.items.filter((i) => i.number !== number);
      return { state: { items, undo: snapshotItems(state), seq: state.seq + 1 }, ok: true, number };
    }

    case "clear": {
      // Wipe the board in one stroke, but keep it reversible: a snapshot lets
      // the operator undo an accidental clear from the station bar.
      if (state.items.length === 0) return { state, ok: false, error: "noop" };
      return { state: { items: [], undo: snapshotItems(state), seq: state.seq + 1 }, ok: true };
    }

    case "import": {
      // Restore a board from an exported file: replace the current items with
      // the incoming set. Sanitize every row (the file is untrusted input) and
      // drop blanks and duplicates so the board can't be corrupted.
      const seen = new Set<string>();
      const items: QueueItem[] = [];
      for (const candidate of action.items) {
        const number = extractNumber(candidate.number);
        if (!number || seen.has(number)) continue;
        seen.add(number);
        const status: QueueStatus = candidate.status === "ready" ? "ready" : "preparing";
        const since =
          typeof candidate.since === "number" && Number.isFinite(candidate.since)
            ? candidate.since
            : now;
        items.push({ number, status, since });
      }
      return { state: { items, undo: snapshotItems(state), seq: state.seq + 1 }, ok: true };
    }

    case "undo": {
      if (!state.undo) return { state, ok: false, error: "nothing_to_undo" };
      return { state: { items: state.undo.items, undo: null, seq: state.seq + 1 }, ok: true };
    }

    case "expire": {
      const items = state.items.filter(
        (i) => !(i.status === "ready" && now - i.since >= EXPIRE_MS),
      );
      if (items.length === state.items.length) return { state, ok: false, error: "noop" };
      // The board changed underneath the operator; the stale undo no longer applies.
      return { state: { items, undo: null, seq: state.seq + 1 }, ok: true };
    }

    default:
      return { state, ok: false, error: "unknown_action" };
  }
}
