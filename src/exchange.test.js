import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarketQuote, fetchMarketQuote } from './model.js';
const sample = () => ({
  code: 'USD',
  codein: 'BRL',
  bid: '5.6189',
  ask: '5.62',
  timestamp: String(Math.floor(Date.now() / 1000)),
});
test('usa compra comercial e mantém o horário real da fonte', () => {
  const value = sample(),
    quote = parseMarketQuote(value);
  assert.equal(quote.rate, 5.6189);
  assert.equal(quote.kind, 'bid');
  assert.equal(quote.timestamp, new Date(Number(value.timestamp) * 1000).toISOString());
  assert.throws(() => parseMarketQuote({ ...value, code: 'BRL', codein: 'USD' }));
  assert.throws(() => parseMarketQuote({ ...value, timestamp: '1' }));
  assert.throws(() => parseMarketQuote({ ...value, bid: 'NaN' }));
});
test('tenta outra rota comercial quando a primeira falha, sem trocar por referência diária', async () => {
  const urls = [];
  const quote = await fetchMarketQuote(async (url) => {
    urls.push(url);
    return urls.length === 1
      ? new Response('', { status: 403 })
      : Response.json({ USDBRL: sample() });
  });
  assert.equal(quote.source, 'AwesomeAPI');
  assert.equal(urls.length, 2);
  assert.ok(urls.every((url) => url.includes('awesomeapi.com.br')));
  await assert.rejects(fetchMarketQuote(async () => new Response('', { status: 403 })));
});
