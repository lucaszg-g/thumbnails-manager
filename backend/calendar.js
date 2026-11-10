import { statuses } from '../src/ui.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const API = 'https://www.googleapis.com/calendar/v3';
const CALENDAR_NAME = 'Thumbs Studio · Prazos';
const COOKIE = '__Host-thumbs-calendar';
const json = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const bytes = (text) => new TextEncoder().encode(text);
const base64 = (data) =>
  btoa(String.fromCharCode(...new Uint8Array(data)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
const unbase64 = (text) =>
  Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
const nonce = () => base64(crypto.getRandomValues(new Uint8Array(32)));
const digest = async (text) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(text)));
const hex = async (text) =>
  Array.from(await digest(text), (b) => b.toString(16).padStart(2, '0')).join('');
const eventID = async (text) => 'ts' + (await hex(text));
const redirectFor = (request) => new URL('/api/calendar/callback', request.url).href;
const dueFor = (job) => Date.parse(job.dueAt || `${job.deadline}T23:59:59-03:00`);

async function encryptionKey(env) {
  if (!env.CALENDAR_ENCRYPTION_KEY)
    throw Error('A configuração segura da agenda ainda não está disponível.');
  return crypto.subtle.importKey('raw', unbase64(env.CALENDAR_ENCRYPTION_KEY), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}
export async function seal(value, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(env),
    bytes(JSON.stringify(value)),
  );
  return base64(iv) + '.' + base64(ciphertext);
}
export async function unseal(value, env) {
  const [iv, ciphertext] = value.split('.');
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unbase64(iv) },
    await encryptionKey(env),
    unbase64(ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(clear));
}
async function google(path, token, method = 'GET', body) {
  const response = await fetch(API + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    const error = Error(
      response.status === 401
        ? 'A autorização do Google expirou. Reconecte sua agenda.'
        : response.status === 403
          ? 'O Google recusou o acesso. Confira a API Calendar e as permissões da conexão.'
          : `Não foi possível atualizar a agenda (Google ${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}
async function getAccess(connection, env) {
  const tokens = await unseal(connection.tokens, env);
  if (tokens.access_token && tokens.expires_at > Date.now() + 60000) return tokens.access_token;
  const config = await unseal(connection.config, env);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(12000),
  });
  const refreshed = await response.json();
  if (!response.ok || !refreshed.access_token)
    throw Error('Reconecte o Google Calendar: a autorização foi revogada ou expirou.');
  const updated = { ...tokens, ...refreshed, expires_at: Date.now() + refreshed.expires_in * 1000 };
  await env.DB.prepare('UPDATE calendar_connection SET tokens=? WHERE id=1')
    .bind(await seal(updated, env))
    .run();
  return updated.access_token;
}
async function ensureCalendar(connection, token, env) {
  if (connection.calendar_id) {
    try {
      await google('/calendars/' + encodeURIComponent(connection.calendar_id), token);
      return connection.calendar_id;
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
  const calendar = await google('/calendars', token, 'POST', {
    summary: CALENDAR_NAME,
    description:
      'Prazos e alertas do Thumbs Studio. Oculte esta agenda desmarcando seu nome na lista do Google Calendar. Eventos gerenciados pelo aplicativo.',
    timeZone: 'America/Sao_Paulo',
  });
  await env.DB.prepare('UPDATE calendar_connection SET calendar_id=? WHERE id=1')
    .bind(calendar.id)
    .run();
  await env.DB.prepare('DELETE FROM calendar_events').run();
  return calendar.id;
}
async function putEvent(calendar, id, event, token) {
  const path = '/calendars/' + encodeURIComponent(calendar) + '/events';
  try {
    return await google(path + '/' + id, token, 'PUT', event);
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  try {
    return await google(path, token, 'POST', { id, ...event });
  } catch (error) {
    if (error.status !== 409) throw error;
    return google(path + '/' + id, token, 'PUT', event);
  }
}
async function removeEvent(calendar, id, token) {
  if (!id) return;
  try {
    await google('/calendars/' + encodeURIComponent(calendar) + '/events/' + id, token, 'DELETE');
  } catch (error) {
    if (![404, 410].includes(error.status)) throw error;
  }
}

export function deadlineEvent(job, client, origin, now = Date.now()) {
  const due = dueFor(job),
    delivered = job.status === 'delivered',
    late = !delivered && due <= now;
  const label = delivered
    ? job.paid
      ? 'Entregue e paga'
      : 'Aguardando pagamento'
    : late
      ? 'ATRASADA'
      : statuses[job.status];
  return {
    summary: `${delivered ? '✓' : late ? '⚠' : '◷'} [${label}] ${job.title}`.slice(0, 250),
    description: `Cliente: ${client?.name || 'Cliente'}\nStatus no app: ${label}\nPrazo de entrega da thumbnail.\n\nGerenciar: ${origin}\n\nAgenda separada: ${CALENDAR_NAME}.`,
    start: { dateTime: new Date(due).toISOString() },
    end: { dateTime: new Date(due + 900000).toISOString() },
    transparency: 'transparent',
    status: 'confirmed',
    colorId: delivered ? '10' : late ? '11' : '2',
    reminders: {
      useDefault: false,
      overrides: delivered
        ? []
        : [
            { method: 'popup', minutes: 60 },
            { method: 'popup', minutes: 15 },
            { method: 'popup', minutes: 0 },
            { method: 'email', minutes: 0 },
          ],
    },
    extendedProperties: { private: { thumbsJobId: job.id, thumbsKind: 'deadline' } },
  };
}

// A lease prevents cron and immediate updates from creating duplicate events.
export async function syncCalendar(
  env,
  origin = env.APP_ORIGIN || 'https://thumbs-studio.thumbs-manager.workers.dev',
) {
  const db = env.DB,
    now = Date.now(),
    lease = now + 600000;
  const connection = await db.prepare('SELECT * FROM calendar_connection WHERE id=1').first();
  if (!connection?.tokens || !connection.config) return { connected: false };
  const lock = await db
    .prepare(
      'UPDATE calendar_connection SET lease_until=? WHERE id=1 AND lease_until<? AND tokens IS NOT NULL',
    )
    .bind(lease, now)
    .run();
  if (!lock.meta.changes) return { running: true };
  try {
    const token = await getAccess(connection, env),
      calendar = await ensureCalendar(connection, token, env);
    const saved = await db.prepare('SELECT data FROM workspace WHERE id=1').first();
    const data = saved.data ? JSON.parse(saved.data) : { jobs: [], clients: [] };
    const stored = (await db.prepare('SELECT * FROM calendar_events').all()).results;
    const mappings = new Map(stored.map((row) => [row.job_id, row]));
    const jobs = new Map(data.jobs.map((job) => [job.id, job]));
    let changes = 0;
    for (const row of stored) {
      if (jobs.has(row.job_id)) continue;
      await removeEvent(calendar, row.event_id, token);
      await removeEvent(calendar, row.overdue_event_id, token);
      await db.prepare('DELETE FROM calendar_events WHERE job_id=?').bind(row.job_id).run();
      if (++changes >= 4) break;
    }
    const orderedJobs = [...data.jobs].sort(
      (a, b) =>
        Number(a.status === 'delivered') - Number(b.status === 'delivered') ||
        dueFor(a) - dueFor(b),
    );
    for (const job of orderedJobs) {
      if (changes >= 4) break;
      const event = deadlineEvent(
        job,
        data.clients.find((client) => client.id === job.clientId),
        origin,
        now,
      );
      const fingerprint = await hex(JSON.stringify(event));
      let row = mappings.get(job.id);
      if (!row) {
        row = {
          event_id: await eventID('deadline:' + job.id),
          overdue_event_id: null,
          reminded_due: null,
        };
        await db
          .prepare('INSERT OR IGNORE INTO calendar_events(job_id,event_id) VALUES(?,?)')
          .bind(job.id, row.event_id)
          .run();
      }
      let changed = false;
      if (row.fingerprint !== fingerprint) {
        await putEvent(calendar, row.event_id, event, token);
        await db
          .prepare('UPDATE calendar_events SET fingerprint=? WHERE job_id=?')
          .bind(fingerprint, job.id)
          .run();
        changed = true;
      }
      const due = String(dueFor(job));
      if (row.overdue_event_id && (job.status === 'delivered' || row.reminded_due !== due)) {
        await removeEvent(calendar, row.overdue_event_id, token);
        row.overdue_event_id = null;
        await db
          .prepare('UPDATE calendar_events SET overdue_event_id=NULL WHERE job_id=?')
          .bind(job.id)
          .run();
        changed = true;
      }
      if (job.status !== 'delivered' && dueFor(job) <= now && row.reminded_due !== due) {
        const id = await eventID('overdue:' + job.id + ':' + due);
        const alert = {
          ...event,
          summary: `⚠ Prazo vencido · ${job.title}`.slice(0, 250),
          description: `Esta thumbnail ainda não foi marcada como entregue.\n${event.description}`,
          start: { dateTime: new Date(now + 120000).toISOString() },
          end: { dateTime: new Date(now + 420000).toISOString() },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 0 },
              { method: 'email', minutes: 0 },
            ],
          },
          extendedProperties: { private: { thumbsJobId: job.id, thumbsKind: 'overdue' } },
        };
        await putEvent(calendar, id, alert, token);
        await db
          .prepare('UPDATE calendar_events SET overdue_event_id=?,reminded_due=? WHERE job_id=?')
          .bind(id, due, job.id)
          .run();
        changed = true;
      }
      if (changed) changes++;
    }
    await db
      .prepare('UPDATE calendar_connection SET last_sync=?,last_error=NULL WHERE id=1')
      .bind(new Date().toISOString())
      .run();
    return { connected: true, changes };
  } catch (error) {
    await db
      .prepare('UPDATE calendar_connection SET last_error=? WHERE id=1')
      .bind(error.message)
      .run();
    return { error: error.message };
  } finally {
    await db
      .prepare('UPDATE calendar_connection SET lease_until=0 WHERE id=1 AND lease_until=?')
      .bind(lease)
      .run();
  }
}

export async function calendarCallback(request, env, ctx) {
  const url = new URL(request.url),
    state = url.searchParams.get('state');
  const cookie = request.headers
    .get('Cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(COOKIE + '='))
    ?.slice(COOKIE.length + 1);
  const clearCookie = `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
  if (!state || !cookie || state !== cookie)
    return json(
      { error: 'Autorização inválida ou expirada. Inicie novamente pelo aplicativo.' },
      400,
    );
  const row = await env.DB.prepare(
    'DELETE FROM calendar_oauth_states WHERE state_hash=? AND expires_at>? RETURNING verifier',
  )
    .bind(await hex(state), Date.now())
    .first();
  if (!row) return json({ error: 'Esta autorização expirou ou já foi utilizada.' }, 400);
  try {
    if (url.searchParams.has('error') || !url.searchParams.get('code'))
      throw Error('A conexão com o Google foi cancelada.');
    const connection = await env.DB.prepare('SELECT * FROM calendar_connection WHERE id=1').first();
    const config = await unseal(connection.config, env),
      pending = await unseal(row.verifier, env);
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: url.searchParams.get('code'),
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectFor(request),
        grant_type: 'authorization_code',
        code_verifier: pending.verifier,
      }),
      signal: AbortSignal.timeout(12000),
    });
    const tokens = await response.json();
    if (!response.ok || !tokens.refresh_token)
      throw Error('O Google não concluiu a autorização offline. Inicie a conexão novamente.');
    const grantedScope = tokens.scope === undefined ? SCOPE : tokens.scope;
    if (typeof grantedScope !== 'string' || !grantedScope.split(' ').includes(SCOPE))
      throw Error('A permissão para a agenda do aplicativo não foi concedida.');
    await env.DB.prepare('UPDATE calendar_connection SET tokens=?,last_error=NULL WHERE id=1')
      .bind(await seal({ ...tokens, expires_at: Date.now() + tokens.expires_in * 1000 }, env))
      .run();
    ctx?.waitUntil?.(syncCalendar(env, new URL(request.url).origin));
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/#calendar-settings',
        'Set-Cookie': clearCookie,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    await env.DB.prepare('UPDATE calendar_connection SET last_error=? WHERE id=1')
      .bind(error.message)
      .run();
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/?calendar=error#calendar-settings',
        'Set-Cookie': clearCookie,
        'Cache-Control': 'no-store',
      },
    });
  }
}

export async function handleCalendarAPI(request, env, ctx) {
  const url = new URL(request.url),
    path = url.pathname;
  if (!path.startsWith('/api/calendar/')) return null;
  const connection = await env.DB.prepare('SELECT * FROM calendar_connection WHERE id=1').first();
  if (path === '/api/calendar/status' && request.method === 'GET')
    return json({
      ready: Boolean(env.CALENDAR_ENCRYPTION_KEY),
      configured: Boolean(connection.config),
      connected: Boolean(connection.tokens),
      calendarName: CALENDAR_NAME,
      calendarUrl: connection.calendar_id
        ? 'https://calendar.google.com/calendar/u/0/r?cid=' +
          encodeURIComponent(btoa(connection.calendar_id))
        : null,
      lastSync: connection.last_sync,
      error: connection.last_error,
      running: connection.lease_until > Date.now(),
      redirectUri: redirectFor(request),
    });
  if (path === '/api/calendar/setup' && request.method === 'POST') {
    if (connection.tokens)
      return json({ error: 'Desconecte a agenda antes de substituir as credenciais.' }, 409);
    const body = await request.text();
    if (body.length > 4096) return json({ error: 'Configuração inválida.' }, 400);
    const { clientId, clientSecret } = JSON.parse(body);
    if (
      typeof clientId !== 'string' ||
      !/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId) ||
      clientId.length > 300 ||
      typeof clientSecret !== 'string' ||
      !clientSecret.trim() ||
      clientSecret.length > 500
    )
      return json({ error: 'Confira o Client ID e o Client Secret do OAuth.' }, 400);
    await env.DB.prepare('UPDATE calendar_connection SET config=?,last_error=NULL WHERE id=1')
      .bind(await seal({ clientId, clientSecret }, env))
      .run();
    return json({ configured: true });
  }
  if (path === '/api/calendar/connect' && request.method === 'POST') {
    if (!connection.config)
      return json({ error: 'Configure primeiro as credenciais OAuth do Google.' }, 400);
    const config = await unseal(connection.config, env),
      state = nonce(),
      verifier = nonce();
    await env.DB.prepare('DELETE FROM calendar_oauth_states WHERE expires_at<?')
      .bind(Date.now())
      .run();
    await env.DB.prepare(
      'INSERT INTO calendar_oauth_states(state_hash,verifier,expires_at) VALUES(?,?,?)',
    )
      .bind(await hex(state), await seal({ verifier }, env), Date.now() + 600000)
      .run();
    const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    target.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectFor(request),
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
      code_challenge: base64(await digest(verifier)),
      code_challenge_method: 'S256',
    }).toString();
    return Response.json(
      { url: target.href },
      {
        headers: {
          'Set-Cookie': `${COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
          'Cache-Control': 'no-store',
        },
      },
    );
  }
  if (path === '/api/calendar/sync' && request.method === 'POST') {
    if (!connection.tokens) return json({ error: 'Conecte sua conta Google primeiro.' }, 400);
    if (ctx?.waitUntil) {
      ctx.waitUntil(syncCalendar(env, new URL(request.url).origin));
      return json({ queued: true }, 202);
    }
    return json(await syncCalendar(env, new URL(request.url).origin));
  }
  if (path === '/api/calendar/disconnect' && request.method === 'POST') {
    const removed = await env.DB.prepare(
      'UPDATE calendar_connection SET config=NULL,tokens=NULL,last_error=NULL WHERE id=1 AND lease_until<?',
    )
      .bind(Date.now())
      .run();
    if (!removed.meta.changes)
      return json({ error: 'Aguarde a sincronização terminar antes de desconectar.' }, 409);
    let revoked = true;
    if (connection.tokens) {
      try {
        const tokens = await unseal(connection.tokens, env);
        const response = await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: tokens.refresh_token }),
          signal: AbortSignal.timeout(12000),
        });
        revoked = response.ok || response.status === 400;
      } catch {
        revoked = false;
      }
    }
    return json({ disconnected: true, revoked });
  }
  return json({ error: 'Rota de agenda não encontrada.' }, 404);
}
