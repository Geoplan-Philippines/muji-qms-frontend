/**
 * muji-qms local sync server.
 *
 * Authoritative queue state for the whole shop, broadcast over WebSocket to
 * every screen (display, scanner, kitchen) running on the local network.
 * State lives in memory and is mirrored to a JSON file so a server restart
 * doesn't drop the board. Run with: `node server/qms-server.ts` (Node >=23
 * strips the types natively).
 */
import { WebSocketServer, type WebSocket } from "ws";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  WS_PORT,
  makeInitialState,
  reduce,
  type Action,
  type QueueState,
  type ServerMessage,
} from "../shared/qms.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(HERE, "queue-state.json");

let state: QueueState = load();

function load(): QueueState {
  try {
    if (existsSync(STATE_FILE)) {
      const raw = JSON.parse(readFileSync(STATE_FILE, "utf8")) as Partial<QueueState>;
      return { items: raw.items ?? [], undo: null, seq: raw.seq ?? 0 };
    }
  } catch (err) {
    console.error("[qms] could not read saved state, starting fresh:", err);
  }
  return makeInitialState();
}

function persist(): void {
  try {
    writeFileSync(STATE_FILE, JSON.stringify({ items: state.items, seq: state.seq }, null, 2));
  } catch (err) {
    console.error("[qms] could not persist state:", err);
  }
}

function snapshot(): string {
  const message: ServerMessage = {
    type: "snapshot",
    items: state.items,
    seq: state.seq,
    canUndo: state.undo !== null,
    serverTime: Date.now(),
  };
  return JSON.stringify(message);
}

function broadcast(): void {
  const message = snapshot();
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(message);
  }
}

const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", (ws: WebSocket) => {
  ws.send(snapshot());

  ws.on("message", (data) => {
    let action: Action;
    try {
      action = JSON.parse(data.toString()) as Action;
    } catch {
      return;
    }

    const result = reduce(state, action, Date.now());
    if (result.ok) {
      state = result.state;
      persist();
      broadcast();
      return;
    }

    // A rejected action (unknown number, duplicate, nothing to undo) is the
    // requester's problem alone; the rest of the shop never sees it.
    const error: ServerMessage = {
      type: "error",
      error: result.error ?? "unknown_action",
      number: result.number ?? null,
      forType: action.type,
    };
    ws.send(JSON.stringify(error));
  });
});

// Sweep expired READY numbers once a second so every screen agrees on timing.
setInterval(() => {
  const result = reduce(state, { type: "expire" }, Date.now());
  if (result.ok) {
    state = result.state;
    persist();
    broadcast();
  }
}, 1000);

wss.on("listening", () => {
  console.log(`[qms] sync server listening on ws://0.0.0.0:${WS_PORT}`);
});

const shutdown = () => {
  persist();
  wss.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
