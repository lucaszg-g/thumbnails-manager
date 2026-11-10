import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import * as model from './model.js';
import * as ui from './ui.js';
import * as workspace from './workspace.js';
import * as pricing from './price-editor.js';

test('formulário aplica preço do cliente, soma adicionais e permite atualizar o quadro', async () => {
  const dom = new JSDOM('<div id="app"></div><dialog id="modal"></dialog><div id="toast"></div>', {
    url: 'http://localhost:3001',
    runScripts: 'outside-only',
  });
  const window = dom.window,
    document = window.document;
  const fixture = {
    rate: 5.5,
    clients: [
      {
        id: 'c',
        name: 'Canal Teste',
        email: '',
        contact: '',
        color: '#123456',
        defaultValue: 100,
        defaultCurrency: 'BRL',
      },
    ],
    jobs: [],
  };
  window.localStorage.setItem('thumbs-studio-v1', JSON.stringify(fixture));
  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const context = dom.getInternalVMContext();
  Object.assign(context, {
    ...model,
    ...ui,
    ...workspace,
    ...pricing,
    structuredClone,
    AbortSignal,
    queue() {},
    connect: async () => {},
    syncState: { status: 'saved', message: 'Salvo' },
    fetch: async () => ({
      ok: true,
      json: async () => ({ base: 'USD', quote: 'BRL', rate: 5.5, date: '2026-11-09' }),
    }),
  });
  context.setInterval = () => 0;
  const source = (await readFile(new URL('./app.js', import.meta.url), 'utf8')).replace(
    /^import[\s\S]*?;\r?\n/gm,
    '',
  );
  try {
    vm.runInContext(source + '\nglobalThis.harness={openForm,navigate,getData:()=>data};', context);
    await new Promise((r) => setImmediate(r));
    const q = (s) => document.querySelector(s);
    const input = (selector, value) => {
      q(selector).value = value;
      q(selector).dispatchEvent(new window.Event('input', { bubbles: true }));
    };
    const submit = () =>
      q('#edit-form').dispatchEvent(
        new window.Event('submit', { cancelable: true, bubbles: true }),
      );
    const start = Date.now();
    context.harness.openForm('job');
    assert.equal(q('#value').value, '100');
    assert.equal(q('#value').readOnly, true);
    assert.equal(q('#currency').value, 'BRL');
    assert.equal(q('#currency').disabled, true);
    assert.ok(new Date(q('#deadline').value).getTime() - start >= 86400000);
    input('#title', 'Thumbnail com variações');
    q('[data-add-extra="Variação de thumbnail"]').click();
    input('[data-extra-price="0"]', '25');
    input('[data-extra-quantity="0"]', '2');
    assert.match(q('#total-preview').textContent, /150,00/);
    submit();
    let job = context.harness.getData().jobs[0];
    assert.ok(job, 'form saved');
    assert.equal(job.baseValue, 100);
    assert.equal(job.value, 150);
    assert.equal(job.currency, 'BRL');
    assert.equal(job.extras.length, 1);
    assert.ok(Date.parse(job.dueAt) - start >= 86400000);
    context.harness.openForm('job', job.id);
    assert.equal(q('#value').value, '100');
    assert.match(q('#total-preview').textContent, /150,00/);
    submit();
    assert.equal(context.harness.getData().jobs[0].value, 150);
    context.harness.openForm('job', job.id);
    input('[data-extra-name="0"]', '');
    submit();
    assert.equal(q('#modal').open, true);
    input('[data-extra-name="0"]', 'Variação corrigida');
    submit();
    assert.equal(context.harness.getData().jobs[0].extras[0].name, 'Variação corrigida');
    context.harness.navigate('jobs');
    assert.equal(document.querySelectorAll('.kanban-column').length, 4);
    const select = q('[data-status]');
    select.value = 'review';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    job = context.harness.getData().jobs[0];
    assert.equal(job.status, 'review');
    assert.equal(job.statusHistory.length, 1);
    q('[data-priority]').click();
    assert.equal(context.harness.getData().jobs[0].priority, 'high');
    const before = Date.parse(context.harness.getData().jobs[0].dueAt);
    q('[data-postpone]').click();
    assert.equal(Date.parse(context.harness.getData().jobs[0].dueAt) - before, 86400000);
    q('[data-duplicate]').click();
    assert.equal(context.harness.getData().jobs.length, 2);
    const copy = context.harness.getData().jobs[1];
    assert.equal(copy.value, 150);
    assert.equal(copy.status, 'briefing');
    assert.equal(copy.paid, false);
    assert.deepEqual(Array.from(copy.files), []);
    const delivered = q(`[data-status="${job.id}"]`);
    delivered.value = 'delivered';
    delivered.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.match(q('.payment-summary').textContent, /1 thumb entregue/);
    q('.payment-summary').click();
    assert.equal(document.querySelectorAll('.job-card').length, 1);
    q(`[data-paid="${job.id}"]`).click();
    assert.match(q('.payment-summary').textContent, /0 thumbs entregues/);
    assert.equal(document.querySelectorAll('.job-card').length, 0);
  } finally {
    window.close();
  }
});
