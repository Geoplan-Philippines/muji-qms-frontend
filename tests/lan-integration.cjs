// Local HTTP + Socket.IO integration with the real Nest app and an in-memory DB
// substitute. Never connects to or changes the shop database.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const { io } = require('socket.io-client');
const serverRoot = path.resolve(__dirname, '../../muji-qms-server');
const serverRequire = createRequire(path.join(serverRoot, 'package.json'));
serverRequire('dotenv').config({ path: path.join(serverRoot, '.env'), quiet: true });
const { Test } = serverRequire('@nestjs/testing');
const { VersioningType } = serverRequire('@nestjs/common');
const { AppModule } = serverRequire('./dist/src/app.module.js');
const { PrismaService } = serverRequire('./dist/src/core/database/prisma.service.js');
const { corsOriginDelegate } = serverRequire('./dist/src/core/config/cors.config.js');
const storeId = '3f9a1c2e-5b74-4d18-9a63-0c8e2f7b41da';
const records = new Map();
const prisma = {
  store: { findUnique: async () => ({ id: storeId }) },
  order: {
    findUnique: async ({ where }) => records.get(where.id) ?? null,
    findFirst: async ({ where }) => [...records.values()].find(o =>
      o.orderNumber === where.orderNumber && where.orderStatus.in.includes(o.orderStatus)) ?? null,
    findMany: async ({ where }) => [...records.values()].filter(o =>
      o.storeId === where.storeId && where.orderStatus.in.includes(o.orderStatus)),
    create: async ({ data }) => {
      const order = { ...data, id: randomUUID(), createdAt: new Date(), updatedAt: new Date() };
      records.set(order.id, order);
      return order;
    },
    update: async ({ where, data }) => {
      const order = { ...records.get(where.id), ...data, updatedAt: new Date() };
      records.set(order.id, order);
      return order;
    },
  },
  readWithRetry: async (_label, operation) => operation(),
  isDatabaseReachable: async () => true,
};

async function check() {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService).useValue(prisma).compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableCors({ origin: corsOriginDelegate, methods: ['GET', 'POST', 'PATCH', 'OPTIONS'] });
  let socket;
  try {
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const request = async (route, method = 'GET', body) => {
      const response = await fetch(`${origin}/api/v1/${route}`, {
        method, headers: { 'Content-Type': 'application/json', Origin: 'http://192.168.0.57:5173' },
        body: body ? JSON.stringify(body) : undefined,
      });
      assert.equal(response.headers.get('access-control-allow-origin'), 'http://192.168.0.57:5173');
      return { status: response.status, json: await response.json() };
    };
    for (const transport of ['polling', 'websocket']) {
      socket = io(`${origin}/orders`, { transports: [transport], reconnection: false, autoConnect: false });
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('connect timed out')), 4000);
        socket.once('connect', () => { clearTimeout(timeout); resolve(); });
        socket.once('connect_error', error => { clearTimeout(timeout); reject(error); });
        socket.connect();
      });
      const time = await socket.timeout(3000).emitWithAck('time:request');
      assert.ok(Math.abs(time.now - Date.now()) < 2000, 'explicit time request must pass global interceptors');
      const joined = await socket.timeout(3000).emitWithAck('join-store', { storeId: storeId.toUpperCase() });
      assert.equal(joined.ok, true);
      assert.equal(joined.room, `store:${storeId}`);
      const event = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('order event timed out')), 3000);
        socket.once('order:created', order => { clearTimeout(timeout); resolve(order); });
      });
      const created = await request('orders', 'POST', { storeId, orderNumber: '7126' });
      assert.equal(created.status, 201);
      const order = await event;
      assert.equal(order.orderNumber, '7126');
      assert.equal((await request(`orders/store/${storeId}`)).json.data.length, 1);
      assert.equal((await request('orders', 'POST', { storeId, orderNumber: '7126' })).status, 409);
      const route = `orders/${order.id}/status`;
      assert.equal((await request(route, 'PATCH', { status: 'SERVING' })).status, 200);
      assert.equal((await request(route, 'PATCH', { status: 'SERVED' })).status, 200);
      assert.equal((await request(route, 'PATCH', { status: 'SERVED' })).status, 200);
      assert.equal((await request(route, 'PATCH', { status: 'PREPARING' })).status, 409);
      assert.equal((await request(`orders/store/${storeId}`)).json.data.length, 0);
      assert.equal((await request('health')).json.db, 'up');
      socket.disconnect();
      console.log(`PASS: ${transport} time sync, store join, live order delivery, REST reconcile, duplicate/retry handling, LAN CORS`);
    }
  } finally {
    socket?.disconnect();
    await app.close();
  }
}
check().catch(error => { console.error(error); process.exitCode = 1; });
