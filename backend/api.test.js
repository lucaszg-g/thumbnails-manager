import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from './sqlite.js';
import { handleAPI, CHUNK_SIZE } from './api.js';
const key = 'test1234';
const state = () => ({
  clients: [{ id: 'c', name: 'Cliente', email: '', color: '#123456' }],
  jobs: [],
  rate: 5.5,
});
const request = (route, method = 'GET', body, auth = true) =>
  new Request('https://thumbs.example/api/' + route, {
    method,
    headers: {
      ...(auth ? { Authorization: 'Bearer ' + key } : {}),
      ...(body && !(body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: body instanceof Uint8Array ? body : JSON.stringify(body) } : {}),
  });
test('autorização, gravação persistente e conflito entre dispositivos', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'thumbs-db-'));
  const filename = path.join(dir, 'test.sqlite');
  let db = openDatabase(filename);
  let env = { DB: db, ACCESS_KEY: key };
  try {
    assert.equal((await handleAPI(request('state', 'GET', undefined, false), env)).status, 401);
    const wrongPassword = request('state');
    wrongPassword.headers.set('Authorization', 'Bearer incorrect-password');
    assert.equal((await handleAPI(wrongPassword, env)).status, 401);
    const cross = request('state');
    cross.headers.set('Origin', 'https://evil.example');
    assert.equal((await handleAPI(cross, env)).status, 403);
    assert.equal(
      (await handleAPI(request('state', 'PUT', { data: state(), revision: 0 }), env)).status,
      200,
    );
    const changed = state();
    changed.rate = 6;
    assert.equal(
      (await handleAPI(request('state', 'PUT', { data: changed, revision: 0 }), env)).status,
      409,
    );
    db.close();
    db = openDatabase(filename);
    env.DB = db;
    const saved = await (await handleAPI(request('state'), env)).json();
    assert.equal(saved.revision, 1);
    assert.equal(saved.data.rate, 5.5);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test('arquivos em partes, integridade, vínculos e remoção', async () => {
  const db = openDatabase(':memory:');
  const env = { DB: db, ACCESS_KEY: key };
  try {
    const file = {
      id: 'file-1',
      name: 'thumb.psd',
      type: 'application/octet-stream',
      size: CHUNK_SIZE + 7,
    };
    assert.equal((await handleAPI(request('files/file-1', 'POST', file), env)).status, 200);
    assert.equal((await handleAPI(request('files/file-1/complete', 'POST'), env)).status, 422);
    const first = new Uint8Array(CHUNK_SIZE).fill(123),
      last = new Uint8Array(7).fill(42);
    for (const [part, bytes] of [first, last].entries())
      assert.equal(
        (await handleAPI(request('files/file-1/chunks/' + part, 'PUT', bytes), env)).status,
        200,
      );
    assert.equal((await handleAPI(request('files/file-1/complete', 'POST'), env)).status, 200);
    const result = await handleAPI(request('files/file-1/chunks/1'), env);
    assert.deepEqual(new Uint8Array(await result.arrayBuffer()), last);
    const data = state();
    data.jobs.push({
      id: 'j',
      clientId: 'c',
      title: 'Thumb',
      value: 100,
      status: 'briefing',
      deadline: '2026-11-10',
      created: '2026-11-09',
      paid: false,
      notes: '',
      files: [file],
    });
    assert.equal(
      (await handleAPI(request('state', 'PUT', { data, revision: 0 }), env)).status,
      200,
    );
    await db
      .prepare("UPDATE files SET created_at=datetime('now','-2 days') WHERE id=?")
      .bind(file.id)
      .run();
    await db
      .prepare(
        "INSERT INTO files(id,name,type,size,created_at) VALUES('abandoned','old','',1,datetime('now','-2 days'))",
      )
      .run();
    const cleanup = await (await handleAPI(request('storage/cleanup', 'POST'), env)).json();
    assert.equal(cleanup.removed, 1);
    assert.equal((await handleAPI(request('files/file-1'), env)).status, 200);
    assert.equal((await handleAPI(request('files/file-1', 'DELETE'), env)).status, 409);
    assert.equal(
      (await handleAPI(request('state', 'PUT', { data: state(), revision: 1 }), env)).status,
      200,
    );
    assert.equal((await handleAPI(request('files/file-1', 'DELETE'), env)).status, 200);
    assert.equal((await handleAPI(request('files/file-1'), env)).status, 404);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM file_chunks').first()).n, 0);
  } finally {
    db.close();
  }
});
test('limite de armazenamento é aplicado no banco antes do upload', async () => {
  const db = openDatabase(':memory:'),
    env = { DB: db, ACCESS_KEY: key };
  try {
    for (let i = 0; i < 10; i++)
      await db
        .prepare('INSERT INTO files(id,name,type,size) VALUES(?,?,?,?)')
        .bind('f' + i, 'x', '', 20 * 1024 * 1024)
        .run();
    assert.equal(
      (await handleAPI(request('files/extra', 'POST', { size: 1, name: 'x', type: '' }), env))
        .status,
      413,
    );
  } finally {
    db.close();
  }
});
