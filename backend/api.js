import { validate, fetchMarketQuote } from '../src/model.js';
import { calendarCallback, handleCalendarAPI, syncCalendar } from './calendar.js';
export const CHUNK_SIZE = 512 * 1024;
const MAX_FILE = 20 * 1024 * 1024,
  MAX_STORAGE = 200 * 1024 * 1024;
const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
async function authorized(request, secret) {
  if (!secret || secret.length < 6) return false;
  const value = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  const hash = async (text) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const [a, b] = await Promise.all([hash(value), hash(secret)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function limitedJSON(request, max = 1024 * 1024) {
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > max) throw new Error('payload');
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function handleAPI(request, env, ctx) {
  const url = new URL(request.url),
    path = url.pathname;
  if (!path.startsWith('/api/')) return null;
  if (path === '/api/calendar/callback') return calendarCallback(request, env, ctx);
  if (path === '/api/config' && request.method === 'GET')
    return json({
      database: true,
      authentication: !env.LOCAL,
      storageLimit: MAX_STORAGE,
      chunkSize: CHUNK_SIZE,
    });
  if (
    request.headers.get('Sec-Fetch-Site') === 'cross-site' ||
    (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin)
  )
    return json({ error: 'Origem não permitida.' }, 403);
  if (!env.LOCAL && !(await authorized(request, env.ACCESS_KEY)))
    return json({ error: 'Senha incorreta. Tente novamente.' }, 401);
  try {
    const calendarResponse = await handleCalendarAPI(request, env, ctx);
    if (calendarResponse) return calendarResponse;
    if (path === '/api/exchange-rate' && request.method === 'GET') {
      try {
        return json(await fetchMarketQuote());
      } catch {
        return json(
          {
            error:
              'Não foi possível consultar o dólar comercial. A última cotação salva foi mantida.',
          },
          502,
        );
      }
    }
    const reference = path.match(/^\/api\/reference\/([a-zA-Z0-9_-]{11})$/);
    if (reference && request.method === 'GET') {
      for (const quality of ['maxresdefault', 'sddefault', 'hqdefault']) {
        const response = await fetch(`https://i.ytimg.com/vi/${reference[1]}/${quality}.jpg`, {
          redirect: 'follow',
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/')) continue;
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 5 * 1024 * 1024) return json({ error: 'Imagem muito grande.' }, 413);
        return new Response(bytes, {
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Disposition': `attachment; filename="referencia-${reference[1]}.jpg"`,
            'Cache-Control': 'private, max-age=3600',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      return json({ error: 'Thumbnail não encontrada.' }, 404);
    }
    const db = env.DB;
    if (path === '/api/state' && request.method === 'GET') {
      const row = await db
        .prepare('SELECT data, revision, updated_at FROM workspace WHERE id=1')
        .first();
      return json({
        data: row.data ? JSON.parse(row.data) : null,
        revision: row.revision,
        updatedAt: row.updated_at,
      });
    }
    if (path === '/api/state' && request.method === 'PUT') {
      const body = await limitedJSON(request);
      if (!validate(body.data) || !Number.isInteger(body.revision) || body.revision < 0)
        return json({ error: 'Dados inválidos.' }, 400);
      const files = body.data.jobs.flatMap((j) => j.files || []);
      // Check every file before committing metadata. This also catches incomplete uploads.
      if (files.length) {
        const stored = await db.prepare('SELECT id,size FROM files WHERE complete=1').all();
        const byId = new Map(stored.results.map((f) => [f.id, f.size]));
        if (files.some((f) => byId.get(f.id) !== f.size))
          return json({ error: 'Aguarde o envio de todos os anexos antes de sincronizar.' }, 422);
      }
      const serialized = JSON.stringify(body.data);
      const result = await db
        .prepare(
          "UPDATE workspace SET data=?, revision=revision+1, updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=? AND NOT EXISTS (SELECT 1 FROM json_each(?,'$.jobs') j, json_each(j.value,'$.files') f LEFT JOIN files a ON a.id=json_extract(f.value,'$.id') AND a.complete=1 AND a.size=json_extract(f.value,'$.size') WHERE a.id IS NULL)",
        )
        .bind(serialized, body.revision, serialized)
        .run();
      if (result.meta.changes !== 1)
        return json(
          {
            error:
              'Outro dispositivo alterou seus dados. Exporte um backup local e carregue a versão do banco.',
          },
          409,
        );
      ctx?.waitUntil?.(syncCalendar(env, new URL(request.url).origin));
      return json({ revision: body.revision + 1 });
    }
    if (path === '/api/storage' && request.method === 'GET') {
      const row = await db.prepare('SELECT COALESCE(SUM(size),0) AS used FROM files').first();
      return json({ used: row.used, limit: MAX_STORAGE });
    }
    if (path === '/api/storage/cleanup' && request.method === 'POST') {
      const result = await db
        .prepare(
          "DELETE FROM files WHERE created_at<datetime('now','-1 day') AND NOT EXISTS (SELECT 1 FROM workspace, json_each(workspace.data,'$.jobs') j, json_each(j.value,'$.files') f WHERE json_extract(f.value,'$.id')=files.id)",
        )
        .run();
      return json({ removed: result.meta.changes });
    }
    const match = path.match(
      /^\/api\/files\/([a-zA-Z0-9-]{1,80})(?:\/(complete|chunks)(?:\/(\d+))?)?$/,
    );
    if (!match) return json({ error: 'Rota não encontrada.' }, 404);
    const [, id, action, partText] = match;
    if (!action && request.method === 'POST') {
      const f = await limitedJSON(request, 4096);
      if (
        !Number.isInteger(f.size) ||
        f.size < 0 ||
        f.size > MAX_FILE ||
        typeof f.name !== 'string' ||
        !f.name ||
        f.name.length > 255 ||
        typeof f.type !== 'string' ||
        f.type.length > 200
      )
        return json({ error: 'Arquivo inválido ou maior que 20 MB.' }, 400);
      const existing = await db
        .prepare('SELECT size,complete FROM files WHERE id=?')
        .bind(id)
        .first();
      if (existing)
        return existing.size === f.size
          ? json(existing)
          : json({ error: 'Identificador já utilizado.' }, 409);
      const result = await db
        .prepare(
          'INSERT INTO files (id,name,type,size) SELECT ?,?,?,? WHERE (SELECT COALESCE(SUM(size),0) FROM files)+?<=?',
        )
        .bind(id, f.name, f.type, f.size, f.size, MAX_STORAGE)
        .run();
      return result.meta.changes === 1
        ? json({ complete: 0 })
        : json(
            { error: 'Limite de 200 MB atingido. Remova arquivos antigos ou use links externos.' },
            413,
          );
    }
    const file = await db.prepare('SELECT * FROM files WHERE id=?').bind(id).first();
    if (!file) return json({ error: 'Arquivo não encontrado.' }, 404);
    if (!action && request.method === 'GET')
      return file.complete ? json(file) : json({ error: 'Envio incompleto.' }, 404);
    if (!action && request.method === 'DELETE') {
      const result = await db
        .prepare(
          "DELETE FROM files WHERE id=? AND NOT EXISTS (SELECT 1 FROM workspace, json_each(workspace.data,'$.jobs') j, json_each(j.value,'$.files') f WHERE json_extract(f.value,'$.id')=files.id)",
        )
        .bind(id)
        .run();
      return result.meta.changes
        ? json({ ok: true })
        : json({ error: 'O arquivo ainda está vinculado a um trabalho.' }, 409);
    }
    if (action === 'chunks' && partText !== undefined) {
      const part = Number(partText),
        count = Math.ceil(file.size / CHUNK_SIZE);
      if (!Number.isInteger(part) || part < 0 || part >= count)
        return json({ error: 'Parte inválida.' }, 400);
      if (request.method === 'PUT') {
        if (file.complete) return json({ ok: true });
        const body = await request.arrayBuffer();
        const expected = Math.min(CHUNK_SIZE, file.size - part * CHUNK_SIZE);
        if (body.byteLength !== expected) return json({ error: 'Tamanho de parte inválido.' }, 400);
        await db
          .prepare(
            'INSERT INTO file_chunks(file_id,part,body) VALUES(?,?,?) ON CONFLICT(file_id,part) DO UPDATE SET body=excluded.body',
          )
          .bind(id, part, body)
          .run();
        return json({ ok: true });
      }
      if (request.method === 'GET' && file.complete) {
        const row = await db
          .prepare('SELECT body FROM file_chunks WHERE file_id=? AND part=?')
          .bind(id, part)
          .first();
        if (!row) return json({ error: 'Parte ausente.' }, 404);
        return new Response(new Uint8Array(row.body), {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
    }
    if (action === 'complete' && request.method === 'POST') {
      const row = await db
        .prepare(
          'SELECT COUNT(*) AS count, COALESCE(SUM(length(body)),0) AS bytes FROM file_chunks WHERE file_id=?',
        )
        .bind(id)
        .first();
      if (row.count !== Math.ceil(file.size / CHUNK_SIZE) || row.bytes !== file.size)
        return json({ error: 'Envio incompleto.' }, 422);
      await db.prepare('UPDATE files SET complete=1 WHERE id=?').bind(id).run();
      return json({ ok: true });
    }
    return json({ error: 'Método não permitido.' }, 405);
  } catch (error) {
    console.error('API error:', error.message);
    return json(
      {
        error:
          error.message === 'payload'
            ? 'Registro muito grande. Exporte seu histórico e reduza as observações.'
            : 'Não foi possível acessar o banco. Tente novamente.',
      },
      error.message === 'payload' ? 413 : 500,
    );
  }
}
