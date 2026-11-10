import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const base = process.argv[2];
if (!base || !base.startsWith('https://')) throw Error('Informe a URL HTTPS publicada.');
const key = (await readFile(new URL('../data/access-key.txt', import.meta.url), 'utf8')).trim();
const call = (route, options = {}) =>
  fetch(base + '/api/' + route, {
    ...options,
    headers: { Authorization: 'Bearer ' + key, ...options.headers },
  });
for (const file of [
  '/',
  '/manifest.webmanifest',
  '/sw.js',
  '/src/sync.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
])
  assert.equal((await fetch(base + file)).status, 200, file);
assert.equal((await fetch(base + '/api/state')).status, 401);
assert.equal((await call('state')).status, 200);
const id = 'verification-' + randomUUID();
try {
  const size = 524288 + 9;
  assert.equal(
    (
      await call('files/' + id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'verification.bin', type: 'application/octet-stream', size }),
      })
    ).status,
    200,
  );
  const bytes = [new Uint8Array(524288).fill(123), new Uint8Array(9).fill(42)];
  for (let part = 0; part < bytes.length; part++)
    assert.equal(
      (await call(`files/${id}/chunks/${part}`, { method: 'PUT', body: bytes[part] })).status,
      200,
    );
  assert.equal((await call(`files/${id}/complete`, { method: 'POST' })).status, 200);
  for (let part = 0; part < bytes.length; part++) {
    const response = await call(`files/${id}/chunks/${part}`);
    assert.equal(response.status, 200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes[part]);
  }
  console.log('HTTPS, PWA, autenticação, D1 e download binário verificados no endereço publicado.');
} finally {
  assert.equal((await call('files/' + id, { method: 'DELETE' })).status, 200);
}
