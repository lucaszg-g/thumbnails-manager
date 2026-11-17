import { seal, unseal } from './calendar.js';
import { parsePortal, readProvider } from './providers.js';
const json = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const names = { workview: 'Sharps', ohero: 'oHero' };
export async function syncIntegrations(env, { force = false, fetcher = fetch } = {}) {
  const { results } = await env.DB.prepare('SELECT * FROM integrations').all();
  for (const row of results) {
    const now = Date.now();
    if (now - row.last_attempt < (force ? 60000 : 5 * 60000)) continue;
    // A database lease prevents concurrent cron/manual refreshes from racing.
    const claim = await env.DB.prepare(
      'UPDATE integrations SET last_attempt=? WHERE id=? AND version=? AND last_attempt=?',
    )
      .bind(now, row.id, row.version, row.last_attempt)
      .run();
    if (!claim.meta.changes) continue;
    try {
      const { token } = await unseal(row.credentials, env);
      const jobs = await readProvider(row.id, token, fetcher);
      if (
        new Set(jobs.map((j) => j.id)).size !== jobs.length ||
        jobs.some((j) => !j.created || !Number.isFinite(Date.parse(j.created)))
      )
        throw Error('Dados incompletos recebidos do portal.');
      await env.DB.prepare(
        'UPDATE integrations SET snapshot=?,last_sync=?,error=NULL WHERE id=? AND version=? AND last_attempt=?',
      )
        .bind(JSON.stringify(jobs), new Date().toISOString(), row.id, row.version, now)
        .run();
    } catch {
      // Never persist upstream errors: they may contain the private portal token.
      await env.DB.prepare(
        'UPDATE integrations SET error=? WHERE id=? AND version=? AND last_attempt=?',
      )
        .bind(
          'Não foi possível atualizar. Confira o link ou tente novamente; a última cópia foi preservada.',
          row.id,
          row.version,
          now,
        )
        .run();
    }
  }
}
export async function integrationState(env) {
  const { results } = await env.DB.prepare(
    'SELECT id,name,snapshot,last_sync,error FROM integrations ORDER BY id',
  ).all();
  return {
    ready: Boolean(env.CALENDAR_ENCRYPTION_KEY),
    companies: results.map((r) => ({
      id: r.id,
      name: r.id === 'workview' && r.name === 'Work View' ? 'Sharps' : r.name,
      jobs: JSON.parse(r.snapshot),
      lastSync: r.last_sync,
      error: r.error,
    })),
  };
}
export async function handleIntegrationsAPI(request, env) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/api/integrations')) return null;
  if (path === '/api/integrations' && request.method === 'GET') {
    // Also works in local mode, where the Cloudflare scheduler is absent.
    await syncIntegrations(env);
    return json(await integrationState(env));
  }
  if (path === '/api/integrations/sync' && request.method === 'POST') {
    await syncIntegrations(env, { force: true });
    return json(await integrationState(env));
  }
  if (path === '/api/integrations' && request.method === 'POST') {
    if (!env.CALENDAR_ENCRYPTION_KEY)
      return json(
        { error: 'Configure a chave de criptografia do servidor para conectar empresas.' },
        503,
      );
    const text = await request.text();
    if (text.length > 4096) return json({ error: 'Link acima do limite.' }, 413);
    let credentials, name;
    try {
      const body = JSON.parse(text);
      credentials = parsePortal(body.link);
      name = (body.name || names[credentials.id]).trim();
      if (!name || name.length > 80) throw Error('Nome inválido.');
    } catch {
      return json(
        {
          error:
            'Use um link válido de equipe do Work View ou de funcionário do oHero e um nome de até 80 caracteres.',
        },
        400,
      );
    }
    // Validate before replacing an existing working connection.
    let jobs;
    try {
      jobs = await readProvider(credentials.id, credentials.token);
    } catch {
      return json(
        {
          error:
            'Não foi possível ler esse portal. Confira se o link está ativo e tente novamente.',
        },
        502,
      );
    }
    await env.DB.prepare(
      'INSERT INTO integrations(id,name,credentials,snapshot,last_sync,last_attempt) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,credentials=excluded.credentials,snapshot=excluded.snapshot,last_sync=excluded.last_sync,last_attempt=excluded.last_attempt,error=NULL,version=integrations.version+1',
    )
      .bind(
        credentials.id,
        name,
        await seal({ token: credentials.token }, env),
        JSON.stringify(jobs),
        new Date().toISOString(),
        Date.now(),
      )
      .run();
    return json(await integrationState(env));
  }
  const id = path.match(/^\/api\/integrations\/(workview|ohero)$/)?.[1];
  if (id && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM integrations WHERE id=?').bind(id).run();
    return json(await integrationState(env));
  }
  return json({ error: 'Rota não encontrada.' }, 404);
}
