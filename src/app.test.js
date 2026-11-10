import * as ui from './ui.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as model from './model.js';

test('interface migra dados e apresenta valores separados; cotação conserva cache na falha', async () => {
  const fixture = {
    rate: 5,
    clients: [
      {
        id: 'c',
        name: 'Cliente <teste>',
        contact: '@discord',
        email: 'teste@example.com',
        color: '#123456',
      },
    ],
    jobs: [
      {
        id: 'usd',
        title: 'Thumb USD',
        clientId: 'c',
        value: 100,
        paid: true,
        paidAt: '2026-11-09',
        created: '2026-11-01',
        deadline: '2026-11-10',
        status: 'delivered',
        notes: '',
      },
      {
        id: 'brl',
        currency: 'BRL',
        title: 'Thumb BRL',
        clientId: 'c',
        value: 200,
        paid: false,
        created: '2026-11-01',
        deadline: '2026-11-10',
        status: 'production',
        notes: '',
      },
    ],
  };
  const store = new Map([['thumbs-studio-v1', JSON.stringify(fixture)]]);
  const app = { innerHTML: '' },
    toast = { textContent: '', style: {} };
  const document = {
    documentElement: { dataset: {} },
    querySelector: (s) => (s === '#app' ? app : s === '#toast' ? toast : null),
    querySelectorAll: () => [],
  };
  const context = vm.createContext({
    ...model,
    ...ui,
    document,
    navigator: {},
    syncState: { status: 'saved', message: 'Salvo no banco' },
    queue() {},
    connect: async () => {},
    structuredClone,
    URL,
    Intl,
    Date,
    console,
    AbortSignal,
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval() {},
    window: { addEventListener() {} },
    localStorage: { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v) },
    fetch: async () => ({
      ok: true,
      json: async () => ({ date: '2026-11-09', base: 'USD', quote: 'BRL', rate: 5.5 }),
    }),
  });
  const source = (await readFile(new URL('./app.js', import.meta.url), 'utf8')).replace(
    /^import[\s\S]*?;\r?\n/gm,
    '',
  );
  vm.runInContext(
    source + '\nglobalThis.harness={navigate,refreshRate,getData:()=>data};',
    context,
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(context.harness.getData().jobs[0].currency, 'USD');
  assert.equal(context.harness.getData().rate, 5.5);
  assert.match(app.innerHTML, /US\$\s*100,00/);
  assert.match(app.innerHTML, /R\$\s*200,00/);
  assert.match(app.innerHTML, /550,00/);
  context.harness.navigate('clients');
  assert.match(app.innerHTML, /data-action="new-client"/);
  assert.match(app.innerHTML, /@discord/);
  assert.match(app.innerHTML, /Cliente &lt;teste&gt;/);
  context.fetch = async () => {
    throw Error('offline');
  };
  await context.harness.refreshRate();
  assert.equal(context.harness.getData().rate, 5.5);
  assert.match(app.innerHTML, /Sem conexão/);
});
