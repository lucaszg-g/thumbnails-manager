import { getFile, putFiles, configureRemote } from './storage.js';
import { validate } from './model.js';
const META = 'thumbs-sync-v1';
let key = sessionStorage.getItem('thumbs-access-key') || '';
let revision = 0,
  pending = false,
  latest = null,
  previous = null,
  busy = false,
  configured = false,
  notify = () => {},
  accept = () => {};
const uploaded = new Set();
export const syncState = { status: 'loading', message: 'Conectando ao banco…' };
function status(value, message) {
  syncState.status = value;
  syncState.message = message;
  notify();
}
function metadata() {
  localStorage.setItem(META, JSON.stringify({ revision, pending }));
}
export async function api(path, options = {}) {
  const response = await fetch('/api/' + path, {
    ...options,
    headers: { ...(key ? { Authorization: 'Bearer ' + key } : {}), ...options.headers },
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    let message = 'Não foi possível sincronizar.';
    try {
      message = (await response.json()).error || message;
    } catch {}
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return response;
}
async function upload(file, blob) {
  if (uploaded.has(file.id)) return;
  const state = await (
    await api('files/' + file.id, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(file),
    })
  ).json();
  if (state.complete) {
    uploaded.add(file.id);
    return;
  }
  for (let part = 0; part < Math.ceil(blob.size / 524288); part++)
    await api(`files/${file.id}/chunks/${part}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: blob.slice(part * 524288, (part + 1) * 524288),
    });
  await api('files/' + file.id + '/complete', { method: 'POST' });
  uploaded.add(file.id);
}
async function remoteFile(id) {
  const file = await (await api('files/' + id)).json();
  const chunks = [];
  for (let part = 0; part < Math.ceil(file.size / 524288); part++)
    chunks.push(await (await api(`files/${id}/chunks/${part}`)).arrayBuffer());
  const blob = new Blob(chunks, { type: file.type });
  await putFiles([[id, blob]]);
  return blob;
}
export async function connect(localData, onData, onStatus) {
  latest = structuredClone(localData);
  accept = onData;
  notify = onStatus;
  try {
    const config = await (
      await fetch('/api/config', { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    ).json();
    if (config.database !== true) {
      status('local', 'Salvo só no navegador');
      return;
    }
    configured = true;
    configureRemote(remoteFile);
    await load();
  } catch (error) {
    if (error.status === 401) status('locked', 'Entre com sua chave de acesso');
    else status('offline', 'Sem conexão · cópia local');
  }
}
async function load() {
  const meta = JSON.parse(localStorage.getItem(META) || '{}');
  revision = meta.revision || 0;
  pending = Boolean(meta.pending);
  const remote = await (await api('state')).json();
  if (remote.data && !validate(remote.data)) throw Error('Dados do banco inválidos.');
  previous = remote.data;
  for (const job of remote.data?.jobs || [])
    for (const file of job.files || []) uploaded.add(file.id);
  if (pending && remote.revision !== revision) {
    status(
      'conflict',
      'Há alterações em outro dispositivo. Exporte um backup local antes de carregar o banco.',
    );
    return;
  }
  if (!pending && remote.data) {
    revision = remote.revision;
    latest = remote.data;
    accept(remote.data);
  } else if (!remote.data) {
    revision = remote.revision;
    pending = true;
  }
  metadata();
  if (pending) {
    status('saving', 'Salvando no banco…');
    await flush();
  } else status('saved', 'Salvo no banco');
}
export async function login(value) {
  key = value.trim();
  sessionStorage.setItem('thumbs-access-key', key);
  try {
    await load();
  } catch (error) {
    sessionStorage.removeItem('thumbs-access-key');
    key = '';
    status(error.status === 401 ? 'locked' : 'offline', error.message);
    throw error;
  }
}
export function queue(snapshot) {
  latest = structuredClone(snapshot);
  pending = true;
  try {
    metadata();
  } catch {}
  if (configured && !['locked', 'conflict'].includes(syncState.status)) void flush();
}
export async function flush() {
  if (busy || !configured || ['locked', 'conflict'].includes(syncState.status)) return;
  busy = true;
  try {
    while (pending) {
      const snapshot = structuredClone(latest);
      const text = JSON.stringify(snapshot);
      status('saving', 'Salvando no banco…');
      for (const job of snapshot.jobs)
        for (const file of job.files || []) {
          if (uploaded.has(file.id)) continue;
          const blob = await getFile(file.id);
          if (!blob) throw Error('Arquivo ausente: ' + file.name);
          await upload(file, blob);
        }
      const result = await (
        await api('state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: snapshot, revision }),
        })
      ).json();
      revision = result.revision;
      pending = JSON.stringify(latest) !== text;
      metadata();
      const refs = new Set(snapshot.jobs.flatMap((j) => (j.files || []).map((f) => f.id)));
      const removed = (previous?.jobs || [])
        .flatMap((j) => j.files || [])
        .filter((f) => !refs.has(f.id));
      previous = snapshot;
      for (const f of removed) await api('files/' + f.id, { method: 'DELETE' }).catch(() => {});
    }
    status('saved', 'Salvo no banco');
  } catch (error) {
    if (error.status === 422) uploaded.clear();
    status(
      error.status === 409 ? 'conflict' : error.status === 401 ? 'locked' : 'offline',
      error.message,
    );
  } finally {
    busy = false;
  }
}
export async function reloadServer() {
  const remote = await (await api('state')).json();
  if (remote.data && !validate(remote.data)) throw Error('Dados inválidos.');
  if (remote.data) {
    revision = remote.revision;
    pending = false;
    latest = remote.data;
    previous = remote.data;
    metadata();
    accept(remote.data);
  }
  status('saved', 'Salvo no banco');
}
export async function retry() {
  if (!configured) {
    location.reload();
    return;
  }
  if (syncState.status === 'conflict') return;
  await load();
}
