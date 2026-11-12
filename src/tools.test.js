import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertCase, youtubeId, monthlyJobs, renderNotes, financialBreakdown } from './tools.js';
import { migrate, validate } from './model.js';
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
