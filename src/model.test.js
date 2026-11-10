import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totals, validate, migrate, elapsed, toggleTimer, safeURL, clientPrice } from './model.js';
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
