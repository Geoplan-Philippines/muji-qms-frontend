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
// Shop-wide chime preference, controlled from a staff station and broadcast to
// the customer display (which actually plays the sound). Lives alongside the
// queue but outside QueueState, so undo/clear never touch it.
let chimeEnabled = true;
load();

function load(): void {
  try {
    if (existsSync(STATE_FILE)) {
      const text = readFileSync(STATE_FILE, "utf8").trim();
      if (text.length === 0) return;

      const raw = JSON.parse(text) as Partial<QueueState> & { chimeEnabled?: boolean };
      state = { items: raw.items ?? [], undo: null, seq: raw.seq ?? 0 };
      chimeEnabled = raw.chimeEnabled !== false; // default on
    }
  } catch (err) {
    console.error("[qms] could not read saved state, starting fresh:", err);
  }
}

function persist(): void {
  try {
    // Write to a sibling temp file and atomically rename it over the real one.
    // writeFileSync truncates before writing, so a crash (or `node --watch`
    // killing the process mid-save) could otherwise leave a 0-byte state file
    // and wipe the whole board on the next start. rename is atomic, so the
    // canonical file is only ever the previous good snapshot or the new one.
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

    // The chime preference lives outside the reduced queue state, so handle it
    // here rather than in the pure reducer.
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
