import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  convertCase,
  youtubeId,
  monthlyJobs,
  renderNotes,
  financialBreakdown,
  renderDeadlineCalendar,
  bindDeadlineCalendar,
} from './tools.js';
import { migrate, today, validate } from './model.js';

test('calendário abre detalhes do dia, respeita o filtro e encaminha para edição', () => {
  const month = today().slice(0, 7);
  const jobs = [
    {
      id: 'own-1',
      title: 'Thumb própria',
      client: 'Cliente',
      status: 'delivered',
      source: 'own',
      deadline: month + '-01',
    },
    {
      id: 'company-1',
      title: 'Thumb da empresa',
      company: 'Sharps',
      status: 'review',
      source: 'workview',
      deadline: month + '-01',
    },
  ];
  const dom = new JSDOM('<main></main><dialog id="modal"></dialog>');
  const previous = globalThis.document;
  const doc = dom.window.document;
  globalThis.document = doc;
  let edited;
  const render = () => {
    doc.querySelector('main').innerHTML = renderDeadlineCalendar(jobs);
    bindDeadlineCalendar(render, (id) => {
      edited = id;
    });
  };
  const dialog = doc.querySelector('dialog');
  dialog.showModal = () => {
    dialog.open = true;
  };
  dialog.close = () => {
    dialog.open = false;
    dialog.dispatchEvent(new dom.window.Event('close'));
  };
  const clickDay = (day) => doc.querySelector(`[data-calendar-day="${month}-${day}"]`).click();
  try {
    render();
    clickDay('01');
    assert.equal(dialog.open, true);
    assert.match(dialog.textContent, /Thumb própria/);
    assert.match(dialog.textContent, /Sharps · Aguardando aprovação/);
    dialog.querySelector('[data-edit]').click();
    assert.equal(dialog.open, false);
    assert.equal(edited, 'own-1');
    clickDay('02');
    assert.match(dialog.textContent, /Nenhuma entrega/);
    dialog.querySelector('[data-close]').click();
    const filter = doc.querySelector('#calendar-filter');
    filter.value = 'open';
    filter.onchange();
    clickDay('01');
    assert.doesNotMatch(dialog.textContent, /Thumb própria/);
    assert.match(dialog.textContent, /Thumb da empresa/);
  } finally {
    globalThis.document = previous;
    dom.window.close();
  }
});
test('conversor preserva Unicode e respeita regras locais e palavras', () => {
  assert.equal(convertCase('ação Ελληνικά русский', 'upper'), 'AÇÃO ΕΛΛΗΝΙΚΆ РУССКИЙ');
  assert.equal(convertCase('istanbul I', 'upper', 'tr'), 'İSTANBUL I');
  assert.equal(convertCase('OLÁ MUNDO', 'first'), 'Olá mundo');
  assert.equal(convertCase('OLÁ. TUDO BEM? SIM!', 'sentence'), 'Olá. Tudo bem? Sim!');
  assert.equal(convertCase('olá mundo', 'title'), 'Olá Mundo');
  assert.equal(convertCase('你好 日本語 😀', 'lower'), '你好 日本語 😀');
  assert.equal(convertCase('a b c', 'alternate'), 'A b C');
});
test('links de referência aceitam somente vídeos YouTube válidos', () => {
  for (const link of [
    'https://youtu.be/dQw4w9WgXcQ?t=2',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/shorts/dQw4w9WgXcQ',
  ])
    assert.equal(youtubeId(link), 'dQw4w9WgXcQ');
  for (const link of [
    'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)',
    'https://youtube.com/watch?v=x',
  ])
    assert.equal(youtubeId(link), null);
});
test('virada de mês zera contagem e preserva arquivo e pendências', () => {
  const jobs = [
    { created: '2026-12-31', paid: false },
    { created: '2027-01-01', paid: true },
  ];
  assert.equal(monthlyJobs(jobs, '2026-12').length, 1);
  assert.equal(monthlyJobs(jobs, '2027-01').length, 1);
  assert.equal(monthlyJobs(jobs, '2027-02').length, 0);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].paid, false);
});
test('notas sobrevivem à migração e escapam conteúdo; gráfico converte moedas', () => {
  const data = migrate({
    rate: 5,
    clients: [],
    jobs: [],
    notes: [{ id: 'n', title: '<script>', body: '<img>', clientId: '' }],
  });
  assert.equal(validate(data), true);
  assert.match(renderNotes(data), /&lt;script&gt;/);
  assert.equal(validate({ ...data, notes: [{ id: 1 }] }), false);
  assert.match(
    financialBreakdown(
      [
        { paid: true, value: 10, currency: 'USD' },
        { paid: true, value: 20, currency: 'BRL' },
      ],
      5,
    ),
    /70,00/,
  );
});
