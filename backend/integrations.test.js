import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './sqlite.js';
import { JSDOM } from 'jsdom';
import { handleAPI } from './api.js';
import { seal } from './calendar.js';
import { syncIntegrations, integrationState } from './integrations.js';
import {
  parsePortal,
  normalizeWorkView,
  normalizeHero,
  decodePortal,
  financialMonth,
  readProvider,
} from './providers.js';
import {
  combinedJobs,
  integrationTotals,
  renderIntegrations,
  bindIntegrations,
  renderIntegrationSummary,
  paymentState,
  jobsInPeriod,
} from '../src/integrations.js';
import { today } from '../src/model.js';

const fixtures = () => ({
  tasks: [
    {
      id: 'a',
      title: 'Thumb',
      client_id: 'c',
      status: 'approved',
      created_at: '2026-11-01',
      reviewed_at: '2026-11-02',
      additional_value: -10,
    },
  ],
  clients: [{ id: 'c', name: 'Cliente', value: 50 }],
  additionals: [{ task_id: 'team-a', value: 15 }],
  payouts: [
    { assignment_id: 'p1', task_id: 'team-a', transfer_value: 20, transfer_status: 'paid' },
    { assignment_id: 'p2', task_id: 'team-a', transfer_value: 35, transfer_status: 'pending' },
  ],
});
test('Work View agrega adicionais, descontos e pagamentos parciais sem duplicar thumbs', () => {
  const f = fixtures();
  f.payouts.push(f.payouts[0]);
  const jobs = normalizeWorkView(f);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].value, 55);
  assert.equal(jobs[0].received, 20);
  f.reconciliations = [{ id: 'r', month: '2026-11', official_total: 45, status: 'paid' }];
  const reconciled = normalizeWorkView(f);
  assert.equal(reconciled.length, 2);
  assert.equal(reconciled[1].kind, 'adjustment');
  assert.equal(
    reconciled.reduce((s, j) => s + j.value, 0),
    45,
  );
  assert.equal(
    reconciled.reduce((s, j) => s + j.received, 0),
    45,
  );
});
test('Sharps aceita working como producao e exclui do financeiro', () => {
  const data = fixtures();
  data.tasks[0].status = 'working';
  const jobs = normalizeWorkView(data);
  assert.equal(jobs[0].status, 'production');
  assert.equal(paymentState(jobs[0]), 'in_progress');
  assert.equal(integrationTotals(jobs, 5).total, 0);
});
test('oHero usa preço final sem somar alterações duas vezes e só baixa meses pagos', () => {
  const data = {
    profile: {},
    clients: [],
    paymentStatuses: [{ client_id: 'c', month_start: '2026-11-01', paid_at: '2026-11-16' }],
    tasks: [
      {
        id: 'a',
        title: 'Thumb',
        client_id: 'c',
        price_brl: 60,
        status: 'done',
        created_at: '2026-10-01',
        completed_at: '2026-11-01',
        attachments: { alterations: [{ amountBrl: 10 }] },
      },
    ],
  };
  assert.equal(normalizeHero(data)[0].value, 60);
  assert.equal(normalizeHero(data)[0].received, 60);
  data.paymentStatuses = [];
  assert.equal(normalizeHero(data)[0].received, 0);
  data.tasks[0].status = 'unknown';
  assert.throws(() => normalizeHero(data));
});
test('pagamento não depende da produção nem de o valor ser zero', () => {
  assert.equal(paymentState({ value: 0, received: 0, status: 'delivered' }), 'pending');
  assert.equal(paymentState({ value: 50, received: 0, status: 'delivered' }), 'pending');
  assert.equal(paymentState({ value: 50, received: 20, status: 'delivered' }), 'partial');
  assert.equal(paymentState({ value: 50, received: 50, status: 'production' }), 'paid');
  assert.equal(paymentState({ value: 0, received: 0, paymentStatus: 'paid' }), 'paid');
  const f = fixtures();
  f.clients[0].value = 0;
  f.tasks[0].additional_value = 0;
  f.additionals = [];
  f.payouts = [];
  assert.equal(normalizeWorkView(f)[0].paymentStatus, 'pending');
  f.tasks[0].is_paid = true;
  assert.equal(normalizeWorkView(f)[0].paymentStatus, 'paid');
});
test('links só permitem os dois portais e decoder não executa plugins nem polui protótipos', () => {
  assert.equal(
    parsePortal('https://work-view-thumbnails.lovable.app/team-portal/abcd1234').id,
    'workview',
  );
  for (const link of [
    'http://localhost/private',
    'https://oheropoggers.lovable.app.evil.test/funcionario?token=abcd1234',
    'https://user:pass@oheropoggers.lovable.app/funcionario?token=abcd1234',
  ])
    assert.throws(() => parsePortal(link));
  assert.throws(() => decodePortal({ t: 25 }));
  assert.throws(() =>
    decodePortal({ t: 10, i: 0, p: { k: ['__proto__'], v: [{ t: 1, s: 'x' }] } }),
  );
  assert.deepEqual(
    decodePortal({
      t: 9,
      i: 0,
      a: [
        { t: 1, s: 'ok' },
        { t: 2, s: 2 },
      ],
    }),
    ['ok', true],
  );
});
test('soma geral converte USD, mantém trabalhos próprios e conta ajustes só como valores', () => {
  const own = {
    clients: [],
    jobs: [{ id: 'same', value: 10, currency: 'USD', paid: true, status: 'delivered' }],
  };
  const jobs = combinedJobs(own, [
    {
      id: 'workview',
      name: 'Empresa',
      jobs: [
        { id: 'workview:same', value: 30, received: 10, currency: 'BRL', status: 'production' },
        { kind: 'adjustment', value: -5, received: -5, currency: 'BRL', status: 'delivered' },
      ],
    },
  ]);
  assert.deepEqual(integrationTotals(jobs, 5), {
    total: 45,
    received: 45,
    pending: 0,
    projected: 0,
    count: 1,
  });
  assert.equal(own.jobs.length, 1);
  assert.match(renderIntegrations({ rate: 5, clients: [], jobs: [] }), /Todas as origens/);
});
test('portais so entram no financeiro depois da entrega, mesmo com pagamento informado', () => {
  for (const source of ['workview', 'ohero']) {
    for (const status of ['briefing', 'production', 'review']) {
      const job = {
        source,
        status,
        currency: 'BRL',
        value: 100,
        received: 100,
        paymentStatus: 'paid',
      };
      assert.equal(paymentState(job), 'in_progress');
      assert.deepEqual(integrationTotals([job], 5), {
        total: 0,
        received: 0,
        pending: 0,
        projected: 0,
        count: 0,
      });
      job.status = 'delivered';
      assert.equal(paymentState(job), 'paid');
      assert.equal(integrationTotals([job], 5).received, 100);
      job.received = 0;
      job.paymentStatus = 'pending';
      assert.equal(paymentState(job), 'pending');
      assert.equal(integrationTotals([job], 5).pending, 100);
    }
  }
});
test('períodos financeiros consideram São Paulo na virada do mês', () => {
  assert.equal(financialMonth('2026-11-01T01:00:00Z'), '2026-10');
  assert.equal(financialMonth('2026-11-01'), '2026-11');
});
test('Work View pagina mais de mil tarefas sem truncar o histórico', async () => {
  const tasks = Array.from({ length: 1002 }, (_, i) => ({
    id: String(i),
    title: 'Thumb',
    client_id: 'c',
    status: 'pending',
    created_at: '2026-11-01',
  }));
  let pages = 0;
  const fetcher = async (url, options) => {
    assert.equal(options.redirect, 'manual');
    if (url === 'https://work-view-thumbnails.lovable.app')
      return new Response('<script src="/assets/index-test.js"></script>');
    if (url.endsWith('/assets/index-test.js'))
      return new Response('https://fgwedmzzwzedoousfnby.supabase.co "eyJhbGciOiJIUzI1NiI-test"');
    const name = url.split('/').at(-1);
    const data =
      name === 'get_team_member_by_portal_token'
        ? [{ id: 'm' }]
        : name === 'get_team_tasks_by_portal_token'
          ? tasks
          : name === 'get_team_clients_by_portal_token'
            ? [{ id: 'c', name: 'Cliente', value: 50 }]
            : [];
    const offset = Number(options.headers.Range.split('-')[0]);
    if (name === 'get_team_tasks_by_portal_token') pages++;
    const page = data.slice(offset, offset + 1000);
    return Response.json(page, {
      headers: {
        'Content-Range': page.length
          ? `${offset}-${offset + page.length - 1}/${data.length}`
          : '*/0',
      },
    });
  };
  const result = await readProvider('workview', 'abcd1234', fetcher);
  assert.equal(result.length, 1002);
  assert.equal(pages, 2);
});
test('filtros da interface separam empresas e trabalhos próprios com valores corretos', async () => {
  const currentMonth = today().slice(0, 7);
  const previousDate = new Date(currentMonth + '-01T12:00:00');
  previousDate.setMonth(previousDate.getMonth() - 1);
  const previousMonth = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, '0')}`;
  const dom = new JSDOM('<main></main><dialog id="modal"></dialog>', { url: 'https://app.test' });
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  const data = {
    rate: 5,
    clients: [],
    jobs: [
      {
        id: 'own',
        title: 'Minha',
        value: 10,
        currency: 'USD',
        paid: true,
        status: 'delivered',
        created: currentMonth + '-01',
      },
    ],
  };
  const companies = [
    {
      id: 'workview',
      name: 'Work View',
      lastSync: '2026-11-17',
      jobs: [
        {
          id: 'workview:a',
          source: 'workview',
          title: '<script>injetado</script>',
          value: 30,
          received: 0,
          currency: 'BRL',
          status: 'production',
          created: currentMonth + '-01',
        },
        {
          id: 'workview:old',
          source: 'workview',
          title: 'Anterior',
          value: 1000,
          received: 1000,
          paymentStatus: 'paid',
          currency: 'BRL',
          status: 'delivered',
          created: previousMonth + '-01',
        },
      ],
    },
  ];
  const api = async () => Response.json({ ready: true, companies });
  const render = () => {
    document.querySelector('main').innerHTML = renderIntegrations(data);
    bindIntegrations(api, render, () => {});
  };
  try {
    render();
    await new Promise((r) => setImmediate(r));
    assert.equal(document.querySelector('.statvalue').textContent, 'R$ 50,00');
    assert.equal(document.querySelectorAll('.integration-list article').length, 2);
    assert.equal(document.querySelectorAll('script').length, 0);
    assert.equal(document.querySelector('#companies-period').value, currentMonth);
    assert.match(document.querySelector('main').textContent, /Sharps/);
    assert.match(document.querySelector('main').textContent, /A receber/);
    const summary = new JSDOM(renderIntegrationSummary(data));
    assert.match(summary.window.document.body.textContent, /Ganho total do mês/);
    assert.equal(summary.window.document.querySelector('.statvalue').textContent, 'R$ 50,00');
    assert.equal(summary.window.document.querySelector('.settings'), null);
    summary.window.close();
    const accumulated = new JSDOM(renderIntegrationSummary(data, 'all'));
    assert.equal(
      accumulated.window.document.querySelector('.statvalue').textContent,
      'R$ 1.050,00',
    );
    accumulated.window.close();
    let periodSelect = document.querySelector('#companies-period');
    periodSelect.value = 'all';
    periodSelect.onchange();
    assert.equal(document.querySelector('.statvalue').textContent, 'R$ 1.050,00');
    periodSelect = document.querySelector('#companies-period');
    periodSelect.value = currentMonth;
    periodSelect.onchange();
    let select = document.querySelector('#companies-source');
    select.value = 'own';
    select.onchange();
    assert.equal(document.querySelector('.statvalue').textContent, 'R$ 50,00');
    assert.equal(document.querySelectorAll('.integration-list article').length, 1);
    select = document.querySelector('#companies-source');
    select.value = 'workview';
    select.onchange();
    assert.equal(document.querySelector('.statvalue').textContent, 'R$ 0,00');
    assert.match(document.querySelector('.integration-list').textContent, /injetado/);
    let paymentSelect = document.querySelector('#companies-payment');
    paymentSelect.value = 'paid';
    paymentSelect.onchange();
    assert.equal(document.querySelectorAll('.integration-job').length, 0);
    paymentSelect = document.querySelector('#companies-payment');
    paymentSelect.value = 'pending';
    paymentSelect.onchange();
    assert.equal(document.querySelectorAll('.integration-job').length, 0);
    paymentSelect = document.querySelector('#companies-payment');
    paymentSelect.value = 'all';
    paymentSelect.onchange();
    const statusSelect = document.querySelector('#companies-status');
    statusSelect.value = 'production';
    statusSelect.onchange();
    assert.equal(document.querySelectorAll('.integration-job').length, 1);
    assert.equal(
      document.querySelector('.integration-payment').textContent.trim(),
      'Trabalhando',
    );
    assert.equal(document.querySelector('.statvalue').textContent, 'R$ 0,00');
    const from = document.querySelector('#companies-from');
    from.value = currentMonth + '-02';
    from.onchange();
    assert.equal(document.querySelectorAll('.integration-job').length, 0);
  } finally {
    globalThis.document = previous;
    dom.window.close();
  }
});
test('API exige autenticação e origem; falha preserva snapshot e não revela tokens', async () => {
  const DB = openDatabase(':memory:');
  const env = {
    DB,
    ACCESS_KEY: 'test123',
    CALENDAR_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64url'),
  };
  const request = (auth, origin) =>
    new Request('https://app.test/api/integrations', {
      headers: {
        ...(auth ? { Authorization: 'Bearer test123' } : {}),
        ...(origin ? { Origin: origin } : {}),
      },
    });
  try {
    assert.equal((await handleAPI(request(false), env)).status, 401);
    assert.equal((await handleAPI(request(true, 'https://evil.test'), env)).status, 403);
    const credentials = await seal({ token: 'private-portal-token' }, env);
    assert.ok(!credentials.includes('private-portal-token'));
    await DB.prepare('INSERT INTO integrations(id,name,credentials,snapshot) VALUES(?,?,?,?)')
      .bind('workview', 'Empresa', credentials, JSON.stringify([{ id: 'old', value: 10 }]))
      .run();
    await syncIntegrations(env, {
      fetcher: async () => {
        throw Error('secret private-portal-token');
      },
    });
    const state = await integrationState(env);
    assert.equal(state.companies[0].jobs[0].id, 'old');
    assert.ok(state.companies[0].error);
    assert.ok(!JSON.stringify(state).includes('private-portal-token'));
    const row = await DB.prepare('SELECT last_attempt FROM integrations').first();
    await syncIntegrations(env, {
      force: true,
      fetcher: async () => {
        throw Error('should not run');
      },
    });
    assert.equal(
      (await DB.prepare('SELECT last_attempt FROM integrations').first()).last_attempt,
      row.last_attempt,
    );
    let attempts = 0;
    const fetcher = async () => {
      attempts++;
      throw Error('offline');
    };
    await DB.prepare('UPDATE integrations SET last_attempt=?,error=NULL')
      .bind(Date.now() - 2 * 60000)
      .run();
    await syncIntegrations(env, { fetcher });
    assert.equal(attempts, 0, 'automatic refresh waits five minutes after success');
    await syncIntegrations(env, { fetcher, force: true });
    assert.equal(attempts, 1, 'manual refresh is available before five minutes');
    await DB.prepare('UPDATE integrations SET last_attempt=?')
      .bind(Date.now() - 2 * 60000)
      .run();
    await syncIntegrations(env, { fetcher });
    assert.equal(attempts, 2, 'automatic refresh retries failures after one minute');
    const response = await handleAPI(
      new Request('https://app.test/api/integrations/workview', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer test123' },
      }),
      env,
    );
    assert.equal(response.status, 200);
    assert.equal((await integrationState(env)).companies.length, 0);
  } finally {
    DB.close();
  }
});
