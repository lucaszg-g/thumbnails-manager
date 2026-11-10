import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './sqlite.js';
import { handleAPI } from './api.js';
import { seal, unseal, syncCalendar, deadlineEvent } from './calendar.js';

const origin = 'https://thumbs.example';
const access = 'test-password';
const encryption = Buffer.alloc(32, 7).toString('base64url');
const config = {
  clientId: 'test-client.apps.googleusercontent.com',
  clientSecret: 'test-client-secret',
};
const request = (path, method = 'GET', body) =>
  new Request(origin + '/api/calendar/' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + access,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

test('OAuth exige senha, protege o state com cookie e não expõe credenciais', async () => {
  const db = openDatabase(':memory:'),
    env = { DB: db, ACCESS_KEY: access, CALENDAR_ENCRYPTION_KEY: encryption };
  const originalFetch = globalThis.fetch;
  try {
    const noPassword = request('setup', 'POST', config);
    noPassword.headers.delete('Authorization');
    assert.equal((await handleAPI(noPassword, env)).status, 401);
    assert.equal((await handleAPI(request('setup', 'POST', config), env)).status, 200);
    const connection = await db.prepare('SELECT config FROM calendar_connection').first();
    assert.ok(!connection.config.includes(config.clientSecret));
    assert.deepEqual(await unseal(connection.config, env), config);
    await assert.rejects(
      unseal(connection.config, {
        CALENDAR_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64url'),
      }),
    );
    const started = await handleAPI(request('connect', 'POST'), env);
    const authURL = new URL((await started.json()).url);
    assert.equal(authURL.origin, 'https://accounts.google.com');
    assert.equal(
      authURL.searchParams.get('scope'),
      'https://www.googleapis.com/auth/calendar.app.created',
    );
    assert.equal(authURL.searchParams.get('redirect_uri'), origin + '/api/calendar/callback');
    assert.equal(authURL.searchParams.get('access_type'), 'offline');
    const callbackURL =
      origin +
      '/api/calendar/callback?code=example-code&state=' +
      encodeURIComponent(authURL.searchParams.get('state'));
    assert.equal((await handleAPI(new Request(callbackURL), env)).status, 400);
    let exchanges = 0;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://oauth2.googleapis.com/token');
      exchanges++;
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('client_secret'), config.clientSecret);
      assert.ok(body.get('code_verifier'));
      const challenge = Buffer.from(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.get('code_verifier'))),
      ).toString('base64url');
      assert.equal(challenge, authURL.searchParams.get('code_challenge'));
      return Response.json({
        access_token: 'google-access',
        refresh_token: 'google-refresh',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/calendar.app.created',
      });
    };
    const callback = new Request(callbackURL, {
      headers: { Cookie: started.headers.get('set-cookie').split(';')[0] },
    });
    const result = await handleAPI(callback, env);
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), '/#calendar-settings');
    assert.equal((await handleAPI(callback, env)).status, 400);
    assert.equal(exchanges, 1);
    const status = await (await handleAPI(request('status'), env)).json();
    assert.equal(status.connected, true);
    assert.equal(status.configured, true);
    assert.ok(!JSON.stringify(status).includes('google-refresh'));
    assert.ok(!JSON.stringify(status).includes('test-client-secret'));
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test('agenda separada sincroniza sem duplicar, avisa um atraso por prazo e remove alertas na entrega', async () => {
  const db = openDatabase(':memory:'),
    env = { DB: db, ACCESS_KEY: access, CALENDAR_ENCRYPTION_KEY: encryption };
  const originalFetch = globalThis.fetch,
    events = new Map();
  let calendarsCreated = 0,
    inserts = 0;
  const data = {
    clients: [{ id: 'c', name: 'Canal', email: '', color: '#123456' }],
    jobs: [
      {
        id: 'job1',
        clientId: 'c',
        title: 'Uma thumbnail',
        status: 'production',
        paid: false,
        value: 100,
        currency: 'USD',
        deadline: '2026-11-10',
        dueAt: new Date(Date.now() + 3600000).toISOString(),
        created: '2026-11-09',
        notes: '',
      },
    ],
    rate: 5.5,
  };
  const save = () =>
    db.prepare('UPDATE workspace SET data=? WHERE id=1').bind(JSON.stringify(data)).run();
  try {
    await db
      .prepare('UPDATE calendar_connection SET config=?,tokens=? WHERE id=1')
      .bind(
        await seal(config, env),
        await seal(
          {
            access_token: 'google-access',
            refresh_token: 'google-refresh',
            expires_at: Date.now() + 3600000,
          },
          env,
        ),
      )
      .run();
    await save();
    globalThis.fetch = async (url, options = {}) => {
      assert.ok(url.startsWith('https://www.googleapis.com/calendar/v3/calendars'));
      assert.ok(!url.includes('/primary'));
      const path = new URL(url).pathname,
        method = options.method || 'GET',
        body = options.body ? JSON.parse(options.body) : null;
      if (path === '/calendar/v3/calendars' && method === 'POST') {
        calendarsCreated++;
        assert.equal(body.summary, 'Thumbs Studio · Prazos');
        return Response.json({ id: 'dedicated-calendar@group.calendar.google.com' });
      }
      if (!path.includes('/events'))
        return Response.json({ id: 'dedicated-calendar@group.calendar.google.com' });
      const id = path.split('/').at(-1);
      if (method === 'PUT') {
        if (!events.has(id)) return Response.json({}, { status: 404 });
        events.set(id, body);
        return Response.json(body);
      }
      if (method === 'POST') {
        inserts++;
        assert.ok(!events.has(body.id));
        events.set(body.id, body);
        return Response.json(body);
      }
      if (method === 'DELETE') {
        events.delete(id);
        return new Response(null, { status: 204 });
      }
      throw Error('Unexpected Calendar request');
    };
    assert.equal((await syncCalendar(env, origin)).connected, true);
    assert.equal(events.size, 1);
    assert.equal(calendarsCreated, 1);
    await syncCalendar(env, origin);
    assert.equal(events.size, 1);
    assert.equal(inserts, 1);
    data.jobs[0].dueAt = new Date(Date.now() - 10000).toISOString();
    await save();
    await syncCalendar(env, origin);
    assert.equal(events.size, 2);
    assert.equal(inserts, 2);
    const overdue = [...events.values()].find(
      (e) => e.extendedProperties.private.thumbsKind === 'overdue',
    );
    assert.ok(overdue);
    assert.ok(overdue.reminders.overrides.some((r) => r.method === 'email'));
    await syncCalendar(env, origin);
    assert.equal(inserts, 2);
    data.jobs[0].status = 'delivered';
    await save();
    await syncCalendar(env, origin);
    assert.equal(events.size, 1);
    const delivered = [...events.values()][0];
    assert.match(delivered.summary, /Aguardando pagamento/);
    assert.equal(delivered.reminders.overrides.length, 0);
    data.jobs[0].paid = true;
    await save();
    await syncCalendar(env, origin);
    assert.match([...events.values()][0].summary, /Entregue e paga/);
    data.jobs = [];
    await save();
    await syncCalendar(env, origin);
    assert.equal(events.size, 0);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM calendar_events').first()).n, 0);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test('um prazo antigo usa o fim do dia no fuso de São Paulo', () => {
  const event = deadlineEvent(
    { id: 'j', title: 'Thumb', deadline: '2026-11-10', status: 'briefing', paid: false },
    { name: 'Canal' },
    origin,
    0,
  );
  assert.equal(event.start.dateTime, '2026-11-11T02:59:59.000Z');
  assert.equal(event.reminders.overrides.length, 4);
});
