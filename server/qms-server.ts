/**
 * muji-qms local sync server (mock — replace with real backend when ready).
 *
 * Authoritative queue state for the whole shop, broadcast over WebSocket to
 * every screen (display, scanner, kitchen) running on the local network.
 * State lives in memory and is mirrored to a JSON file so a server restart
 * doesn't drop the board. Run with: `node server/qms-server.ts` (Node >=23
 * strips the types natively).
 *
 * BACKEND NOTE: This is a placeholder server for frontend development.
 * The real backend lives in a separate repository. To connect to the real
 * backend, set VITE_WS_URL in .env.local (see .env.example).
 */
import { WebSocketServer, type WebSocket } from "ws";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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

let state: QueueState = makeInitialState();
let chimeEnabled = true;
load();

function load(): void {
  try {
    if (existsSync(STATE_FILE)) {
      const text = readFileSync(STATE_FILE, "utf8").trim();
      if (text.length === 0) return;

      const raw = JSON.parse(text) as Partial<QueueState> & { chimeEnabled?: boolean };
      state = { items: raw.items ?? [], undo: null, seq: raw.seq ?? 0 };
      chimeEnabled = raw.chimeEnabled !== false;
    }
  } catch (err) {
    console.error("[qms] could not read saved state, starting fresh:", err);
  }
}

function persist(): void {
  try {
    const tmp = `${STATE_FILE}.tmp`;
    writeFileSync(
      tmp,
      JSON.stringify({ items: state.items, seq: state.seq, chimeEnabled }, null, 2),
    );
    renameSync(tmp, STATE_FILE);
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
    chimeEnabled,
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

    if (action.type === "setChime") {
      chimeEnabled = action.on;
      persist();
      broadcast();
      return;
    }

    const result = reduce(state, action, Date.now());
    if (result.ok) {
      state = result.state;
      persist();
      broadcast();
      return;
    }

    const error: ServerMessage = {
      type: "error",
      error: result.error ?? "unknown_action",
      number: result.number ?? null,
      forType: action.type,
    };
    ws.send(JSON.stringify(error));
  });
});

setInterval(() => {
  const result = reduce(state, { type: "expire" }, Date.now());
  if (result.ok) {
    state = result.state;
    persist();
    broadcast();
  }
}, 1000);

wss.on("listening", () => {
  console.log(`[qms] mock sync server listening on ws://0.0.0.0:${WS_PORT}`);
  console.log(`[qms] set VITE_WS_URL in .env.local to point at the real backend`);
});

const shutdown = () => {
  persist();
  wss.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
