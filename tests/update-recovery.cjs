const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

async function check() {
  let now = 100000, latest = 'current', blocked = false, online = true;
  const intervals = [], timeouts = [], navigations = [];
  const windowHandlers = new Map();
  const noop = () => {};
  const source = fs.readFileSync('src/main.tsx', 'utf8').replaceAll('import.meta.env.PROD', 'true');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, {
    exports: {}, __BUILD_ID__: 'current', URL,
    Date: class extends Date { static now() { return now; } },
    setInterval: fn => intervals.push(fn), setTimeout: fn => timeouts.push(fn),
    navigator: {}, // Normal HTTP LAN: no service-worker API.
    document: { getElementById: () => ({}), addEventListener: noop },
    window: {
      addEventListener: (name, fn) => windowHandlers.set(name, fn),
      location: { href: 'http://192.168.1.10/staff', replace: url => navigations.push(url) },
    },
    require: name => {
      if (name === 'react') return { StrictMode: noop };
      if (name === 'react/jsx-runtime') return { jsx: noop };
      if (name === 'react-dom/client') return { createRoot: () => ({ render: noop }) };
      if (name === './lib/reload-guard') return { isReloadBlocked: () => blocked };
      if (name === './lib/net') return { requestJson: async () => {
        if (!online) throw new Error('LAN down');
        return { buildId: latest };
      } };
      if (name === './app' || name === './index.css') return {};
      throw new Error(name);
    },
  });
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  await settle();
  assert.equal(navigations.length, 0, 'same version must not reload');
  now += 1800000;
  online = false;
  intervals.forEach(fn => fn());
  await settle();
  assert.equal(navigations.length, 0, 'offline version check must not reload');
  online = true;
  latest = 'next-build';
  blocked = true;
  intervals.forEach(fn => fn());
  await settle();
  assert.equal(navigations.length, 0, 'unfinished entry must block new-build reload');
  assert.equal(timeouts.length, 1);
  blocked = false;
  windowHandlers.get('keydown')();
  timeouts.shift()();
  await settle();
  assert.equal(navigations.length, 0, 'recent interaction must defer reload');
  now += 31000;
  online = false;
  timeouts.shift()();
  await settle();
  assert.equal(navigations.length, 0, 'LAN must still be reachable immediately before reload');
  online = true;
  timeouts.shift()();
  await settle();
  assert.equal(navigations.length, 1);
  assert.equal(new URL(navigations[0]).pathname, '/staff');
  assert.equal(new URL(navigations[0]).searchParams.get('_qms_build'), 'next-build');
  console.log('PASS: plain HTTP update detection, idle/entry protection, LAN recheck and cache-busting navigation');
}

check().catch(error => { console.error(error); process.exitCode = 1; });
