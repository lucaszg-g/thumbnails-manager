import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  totals,
  validate,
  migrate,
  elapsed,
  toggleTimer,
  safeURL,
  clientPrice,
  defaultDeadline,
  dueTimestamp,
  deadlineState,
  priceBreakdown,
  setJobStatus,
} from './model.js';
const fixture = () => ({
  rate: 5.2,
  clients: [{ id: '1', name: 'Canal', email: '', color: '#123456' }],
  jobs: [
    {
      id: 'j',
      clientId: '1',
      title: 'Teste',
      value: 80,
      status: 'delivered',
      deadline: '2026-11-10',
      created: '2026-11-01',
      paid: false,
      paidAt: null,
      notes: '',
    },
  ],
});
test('novo prazo tem pelo menos 24 horas reais e mantém compatibilidade com datas antigas', () => {
  const now = Date.parse('2026-11-09T15:34:28Z');
  const due = new Date(defaultDeadline(now)).getTime();
  assert.ok(due - now >= 86400000);
  assert.ok(due - now < 86460000);
  const legacy = fixture().jobs[0];
  assert.equal(dueTimestamp(legacy), new Date(legacy.deadline + 'T23:59:59').getTime());
  const job = { ...legacy, status: 'production', dueAt: new Date(now + 3600000).toISOString() };
  assert.equal(deadlineState(job, now).tone, 'urgent');
  assert.equal(deadlineState(job, now + 3600001).tone, 'late');
  assert.equal(deadlineState({ ...job, status: 'delivered' }, now + 3600001).tone, 'done');
});
test('adicionais compõem o total sem duplicar a base ao reabrir o trabalho', () => {
  const job = {
    ...fixture().jobs[0],
    baseValue: 80,
    extras: [{ id: 'e', name: 'Variação', quantity: 3, unitValue: 10.1 }],
    value: 110.3,
  };
  assert.deepEqual(priceBreakdown(job), { base: 80, extras: 30.3, total: 110.3 });
  assert.equal(clientPrice({}, job).value, 80);
  assert.equal(validate({ ...fixture(), jobs: [job] }), true);
  for (const alter of [
    (j) => (j.value = 80),
    (j) => (j.extras[0].quantity = 0),
    (j) => (j.extras[0].quantity = 1.5),
    (j) => (j.extras[0].unitValue = -1),
    (j) => (j.extras[0].name = ''),
    (j) => (j.dueAt = 'bad'),
  ]) {
    const invalid = structuredClone(job);
    alter(invalid);
    assert.equal(validate({ ...fixture(), jobs: [invalid] }), false);
  }
  assert.equal(totals([job]).pending, 110.3);
});
test('troca rápida de status registra histórico e pausa o cronômetro na entrega', () => {
  const job = { ...fixture().jobs[0], status: 'production', elapsedMs: 2000, timerStartedAt: 1000 };
  assert.equal(setJobStatus(job, 'delivered', 6000), true);
  assert.equal(job.elapsedMs, 7000);
  assert.equal(job.timerStartedAt, null);
  assert.equal(job.statusHistory[0].status, 'delivered');
  assert.equal(setJobStatus(job, 'delivered', 9000), false);
  assert.equal(job.statusHistory.length, 1);
  assert.equal(setJobStatus(job, 'unknown', 9000), false);
  for (let i = 0; i < 30; i++) setJobStatus(job, i % 2 ? 'review' : 'production', 10000 + i);
  assert.equal(job.statusHistory.length, 20);
});
test('preço padrão respeita moeda, aceita zero e preserva trabalhos já negociados', () => {
  const client = { defaultValue: 75, defaultCurrency: 'BRL' };
  assert.deepEqual(clientPrice(client), { value: 75, currency: 'BRL' });
  assert.deepEqual(clientPrice({ defaultValue: 0, defaultCurrency: 'USD' }), {
    value: 0,
    currency: 'USD',
  });
  assert.deepEqual(clientPrice({}), { value: '', currency: 'USD' });
  assert.deepEqual(clientPrice(client, { value: 120, currency: 'USD' }), {
    value: 120,
    currency: 'USD',
  });
  const legacy = migrate(fixture());
  assert.equal(legacy.clients[0].defaultValue, null);
  assert.equal(legacy.clients[0].defaultCurrency, 'USD');
  assert.equal(validate(legacy), true);
  for (const value of [-1, Infinity, '50', 10000001]) {
    const data = migrate(fixture());
    data.clients[0].defaultValue = value;
    assert.equal(validate(data), false);
  }
  legacy.clients[0].defaultValue = 0;
  legacy.clients[0].defaultCurrency = 'BRL';
  assert.equal(validate(legacy), true);
  legacy.clients[0].defaultCurrency = 'EUR';
  assert.equal(validate(legacy), false);
});
test('separa recebimentos de valores pendentes sem depender da entrega', () => {
  assert.deepEqual(
    totals([
      { value: 80, paid: false, status: 'delivered' },
      { value: 120, paid: true, status: 'production' },
    ]),
    { total: 200, received: 120, pending: 80 },
  );
  assert.deepEqual(totals([]), { total: 0, received: 0, pending: 0 });
});
test('não mistura moedas e migra trabalhos antigos como USD', () => {
  const legacy = fixture(),
    migrated = migrate(legacy);
  assert.equal(migrated.jobs[0].currency, 'USD');
  assert.deepEqual(migrated.jobs[0].files, []);
  assert.equal(migrated.clients[0].contact, '');
  const jobs = [
    ...migrated.jobs,
    { ...migrated.jobs[0], id: 'brl', value: 250, currency: 'BRL', paid: true },
  ];
  assert.deepEqual(totals(jobs), { total: 80, received: 0, pending: 80 });
  assert.deepEqual(totals(jobs, 'BRL'), { total: 250, received: 250, pending: 0 });
  assert.equal(validate({ ...migrated, jobs }), false); // paid requires a receipt date
  jobs[1].paidAt = '2026-11-09';
  assert.equal(validate({ ...migrated, jobs }), true);
  assert.equal(legacy.jobs[0].currency, undefined);
});
test('cronômetro pausa ao trocar trabalho e retoma sem perder tempo', () => {
  const jobs = [
    { id: 'a', elapsedMs: 0 },
    { id: 'b', elapsedMs: 0 },
  ];
  toggleTimer(jobs, 'a', 1000);
  assert.equal(elapsed(jobs[0], 6000), 5000);
  toggleTimer(jobs, 'b', 6000);
  assert.equal(jobs[0].timerStartedAt, null);
  assert.equal(jobs[0].elapsedMs, 5000);
  toggleTimer(jobs, 'b', 9000);
  assert.equal(elapsed(jobs[1], 12000), 3000);
  toggleTimer(jobs, 'a', 15000);
  assert.equal(elapsed(jobs[0], 17000), 7000);
  assert.equal(elapsed(jobs[0], 14000), 5000);
  const restored = JSON.parse(JSON.stringify(jobs));
  assert.equal(elapsed(restored[0], 18000), 8000);
});
test('backup rejeita links executáveis e campos de cronômetro inválidos', () => {
  assert.equal(safeURL('javascript:alert(1)'), null);
  assert.equal(safeURL('file:///secret'), null);
  assert.equal(safeURL('https://example.com/ref'), 'https://example.com/ref');
  for (const change of [
    (j) => (j.currency = 'EUR'),
    (j) => (j.elapsedMs = -3),
    (j) => (j.timerStartedAt = 'bad'),
    (j) => (j.links = ['javascript:alert(1)']),
    (j) => (j.files = [{ id: 'f', name: 'thumb.png', type: 'image/png', size: -1 }]),
  ]) {
    const d = migrate(fixture());
    change(d.jobs[0]);
    assert.equal(validate(d), false);
  }
});
test('backup exige referências válidas, valores finitos e data de pagamento', () => {
  assert.equal(validate(fixture()), true);
  for (const mutate of [
    (d) => (d.jobs[0].clientId = 'missing'),
    (d) => (d.jobs[0].value = -1),
    (d) => (d.jobs[0].value = Infinity),
    (d) => (d.jobs[0].paid = true),
    (d) => (d.rate = 0),
    (d) => (d.clients[0].color = 'red'),
    (d) => d.jobs.push({ ...d.jobs[0] }),
  ]) {
    const d = fixture();
    mutate(d);
    assert.equal(validate(d), false);
  }
  const d = fixture();
  d.jobs[0].paid = true;
  d.jobs[0].paidAt = '2026-11-09';
  assert.equal(validate(d), true);
});

test('stage timers resume independently across status changes and backup', async () => {
  const { stageElapsed, pauseTimer } = await import('./model.js');
  const job = { id: 'stages', status: 'briefing', elapsedMs: 0 };
  setJobStatus(job, 'production', 1000);
  assert.equal(stageElapsed(job, 'production', 4000), 3000);
  setJobStatus(job, 'review', 4000);
  assert.equal(stageElapsed(job, 'production', 6000), 3000);
  assert.equal(stageElapsed(job, 'review', 6000), 2000);
  setJobStatus(job, 'production', 6000);
  assert.equal(stageElapsed(job, 'production', 9000), 6000);
  assert.equal(stageElapsed(job, 'review', 9000), 2000);
  toggleTimer([job], job.id, 9000);
  assert.equal(stageElapsed(job, 'production', 12000), 6000);
  toggleTimer([job], job.id, 12000);
  setJobStatus(job, 'review', 14000);
  const backup = structuredClone(job);
  pauseTimer(backup, 16000);
  assert.equal(stageElapsed(backup, 'production', 20000), 8000);
  assert.equal(stageElapsed(backup, 'review', 20000), 4000);
  setJobStatus(job, 'delivered', 17000);
  assert.equal(stageElapsed(job, 'review', 25000), 5000);
  assert.equal(elapsed(job, 25000), 13000);
  assert.equal(job.timerStartedAt, null);
});
