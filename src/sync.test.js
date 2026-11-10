import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../backend/sqlite.js';
import { handleAPI } from '../backend/api.js';
test('sincronização retoma offline e impede sobrescrita de outro dispositivo', async () => {
  const db = openDatabase(':memory:'),
    store = new Map(),
    session = new Map();
  const original = {
    fetch: globalThis.fetch,
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
  };
  let online = true,
    accepted;
  const state = { clients: [], jobs: [], rate: 5.5 };
  const adapter = (m) => ({
    getItem: (k) => m.get(k) || null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  });
  globalThis.localStorage = adapter(store);
  globalThis.sessionStorage = adapter(session);
  globalThis.fetch = async (url, options = {}) => {
    if (!online) throw Error('offline');
    return handleAPI(new Request('http://localhost' + url, options), { DB: db, LOCAL: true });
  };
  try {
    const sync = await import('./sync.js?test-sync');
    await sync.connect(
      state,
      (value) => (accepted = value),
      () => {},
    );
    assert.equal(sync.syncState.status, 'saved');
    online = false;
    sync.queue({ ...state, rate: 6 });
    await new Promise((r) => setImmediate(r));
    assert.equal(sync.syncState.status, 'offline');
    assert.equal(JSON.parse(store.get('thumbs-sync-v1')).pending, true);
    online = true;
    await sync.retry();
    assert.equal(sync.syncState.status, 'saved');
    let remote = await (await globalThis.fetch('/api/state')).json();
    assert.equal(remote.data.rate, 6);
    await globalThis.fetch('/api/state', {
      method: 'PUT',
      body: JSON.stringify({ data: { ...state, rate: 7 }, revision: remote.revision }),
    });
    sync.queue({ ...state, rate: 8 });
    for (let i = 0; i < 20 && sync.syncState.status === 'saving'; i++)
      await new Promise((r) => setImmediate(r));
    assert.equal(sync.syncState.status, 'conflict');
    remote = await (await globalThis.fetch('/api/state')).json();
    assert.equal(remote.data.rate, 7);
    await sync.reloadServer();
    assert.equal(accepted.rate, 7);
    assert.equal(sync.syncState.status, 'saved');
  } finally {
    Object.assign(globalThis, original);
    db.close();
  }
});
