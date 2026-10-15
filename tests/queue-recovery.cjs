const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
// Runs the real hooks with a virtual clock, socket and HTTP responses.

async function check() {
  let now = Date.parse('2026-10-15T07:12:00Z');
  const start = now;
  let cursor = 0, timerId = 0, reads = 0;
  const slots = [], effects = [], timers = new Map(), handlers = new Map();
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps };
      return slots[i].fn;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) {
        slots[i]?.cleanup?.();
        slots[i] = { deps };
        effects.push(() => { slots[i].cleanup = fn(); });
      }
    },
  };
  const schedule = (fn, delay, repeat) => {
    const id = ++timerId;
    timers.set(id, { fn, due: now + delay, repeat: repeat ? delay : 0 });
    return id;
  };
  const noop = () => {};
  const socket = {
    connected: true, active: true, id: 'test',
    io: { on: noop, off: noop },
    on: (name, fn) => handlers.set(name, fn), onAny: noop, offAny: noop,
    emit: noop, timeout() { return this; }, removeAllListeners: noop,
    disconnect() { this.connected = false; }, connect() { this.connected = true; },
  };
  let orders = [{ id: 'order-7126', orderNumber: '7126', storeId: 'test', orderStatus: 'PREPARING',
    createdAt: new Date(start).toISOString(), updatedAt: new Date(start).toISOString() }];
  let responseMode = 'ok', frontendReachable = false, reloads = 0, blocked = false;
  let finishWrite;
  const net = {
    requestJson: async url => {
      if (url.endsWith('/health')) return { now: now + 120000 };
      reads++;
      if (responseMode === 'error') throw new Error('LAN unavailable');
      if (responseMode === 'malformed') return {};
      return { data: orders };
    },
    requestVoid: async (_url, init = {}) => {
      if (init.method === 'PATCH') return new Promise(resolve => { finishWrite = resolve; });
      if (!frontendReachable) throw new Error('LAN unavailable');
    },
    withRetry: operation => operation(),
    hasPendingMutations: () => false,
    isRequestFailure: () => false,
  };
  const storage = { getItem: () => null, removeItem: noop, setItem: noop };
  const sandbox = {
    Date: class extends Date { static now() { return now; } },
    console: { log: noop, warn: noop }, URLSearchParams,
    localStorage: storage, sessionStorage: storage,
    document: { addEventListener: noop, removeEventListener: noop, querySelector: () => blocked ? {} : null },
    setInterval: (fn, delay) => schedule(fn, delay, true), clearInterval: id => timers.delete(id),
    setTimeout: (fn, delay) => schedule(fn, delay, false), clearTimeout: id => timers.delete(id),
  };
  sandbox.window = { ...sandbox, location: { search: '', reload: () => reloads++ }, addEventListener: noop, removeEventListener: noop };
  const load = file => {
    const source = fs.readFileSync(file, 'utf8');
    const code = ts.transpileModule(source.replaceAll('import.meta.env', '({ VITE_STORE_ID: "test" })'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {};
    vm.runInNewContext(code, { ...sandbox, exports, require: name => {
      if (name === 'react') return react;
      if (name === 'socket.io-client') return { io: () => socket };
      if (name === './net') return net;
      if (name === './reload-guard') return load('src/lib/reload-guard.ts');
      if (name.endsWith('qms.ts')) return load('shared/qms.ts');
      throw new Error(name);
    } });
    return exports;
  };
  const { useQueue } = load('src/lib/use-queue.ts');
  const { useClock } = load('src/lib/use-clock.ts');
  let board, clock;
  function render() {
    cursor = 0;
    board = useQueue();
    clock = useClock(1000, board.clockOffset);
    while (effects.length) effects.shift()();
  }
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); render(); };
  async function advance(ms) {
    const target = now + ms;
    while (true) {
      const next = [...timers].filter(([, t]) => t.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      const [id, timer] = next;
      now = timer.due;
      if (timer.repeat) timer.due += timer.repeat; else timers.delete(id);
      timer.fn();
      await settle();
    }
    now = target;
    await settle();
  }
  render();
  await settle();
  // The server is two minutes ahead of this device.
  handlers.get('time:sync')({ now: start + 120000 });
  render();
  await advance(45000);
  assert.equal(board.clockOffset, 120000, 'unchanged polls must preserve server calibration');
  assert.equal(clock.getTime(), start + 165000, 'clock must advance with an idle order');
  assert.equal(board.items[0].number, '7126');
  assert.ok(reads > 2, 'must actually exercise repeated polling');
  socket.disconnect();
  handlers.get('disconnect')('transport close');
  await advance(30000);
  assert.equal(clock.getTime(), start + 195000, 'clock must advance while disconnected');
  assert.equal(board.items.length, 1, 'idle order must stay on board');
  handlers.get('order:status-updated')({ ...orders[0], orderStatus: 'SERVING' });
  render();
  assert.equal(board.clockOffset, 120000, 'delayed order event must not rewind clock');
  responseMode = 'malformed';
  await advance(15000);
  assert.equal(board.items.length, 1, 'malformed success must not clear the board');
  responseMode = 'error';
  await advance(360000);
  assert.equal(board.items.length, 1, 'failed polls must preserve the board');
  assert.equal(board.status, 'offline');
  assert.equal(reloads, 0, 'unreachable frontend must not reload into a browser error');
  blocked = true;
  frontendReachable = true;
  await advance(60000);
  assert.equal(reloads, 0, 'unfinished entry must prevent a recovery reload');
  blocked = false;
  responseMode = 'ok';
  orders = [];
  await advance(15000);
  assert.equal(board.items.length, 0);
  assert.equal(clock.getTime(), now + 120000, 'clock must advance with an empty queue');
  orders = [{ id: 'pending-order', orderNumber: '7127', storeId: 'test', orderStatus: 'SERVING',
    createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() }];
  handlers.get('order:created')(orders[0]);
  render();
  board.collect('7127');
  await advance(15000);
  assert.equal(board.items.length, 0, 'a poll during a pending collection must not resurrect the order');
  orders = [];
  finishWrite();
  await settle();
  assert.equal(board.items.length, 0);
}
(async () => {


  await check();
  console.log('PASS: idle/disconnected/empty clocks, HTTP time fallback, malformed/failed poll preservation, LAN recovery reload protection, unfinished-entry protection');
})().catch(err => { console.error(err); process.exitCode = 1; });


