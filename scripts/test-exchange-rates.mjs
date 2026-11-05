// Teste das moedas e câmbio (src/lib/exchangeRates.ts). Uso: node --experimental-strip-types scripts/test-exchange-rates.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyEcbRates, changePercent, convertAmount, crossRate, normalizeCurrencySettings, parseEcbXml, roundRate, wantedCurrencies,
} from '../src/lib/exchangeRates.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

// Formato do arquivo diário do BCE (aspas simples, como o BCE publica).
const ECB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender>
  <Cube>
    <Cube time='2026-10-06'>
      <Cube currency='USD' rate='1.0950'/>
      <Cube currency='JPY' rate='162.35'/>
      <Cube currency='GBP' rate='0.84120'/>
      <Cube currency='BRL' rate='6.1234'/>
      <Cube currency='MXN' rate='21.5'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

test('cópia igual na função update-exchange-rates', () => {
  assert.equal(readFileSync('src/lib/exchangeRates.ts', 'utf8'), readFileSync('supabase/functions/_shared/exchangeRates.ts', 'utf8'));
});

test('lê o XML do BCE', () => {
  const ecb = parseEcbXml(ECB_XML);
  assert.equal(ecb.date, '2026-10-06');
  assert.deepEqual(ecb.rates, { EUR: 1, USD: 1.095, JPY: 162.35, GBP: 0.8412, BRL: 6.1234, MXN: 21.5 });
  assert.equal(parseEcbXml('<html>erro</html>'), null);
  assert.equal(parseEcbXml("<Cube time='2026-10-06'></Cube>"), null);
});

test('regras normalizadas (valor antigo do site continua a valer)', () => {
  const s = normalizeCurrencySettings({ default: 'BRL', available: ['brl', 'usd', 'EUR', 'xx'], rates: { USD: 5, EUR: '0.18', BRL: 1, BAD: -1 }, markup: 80, last_auto_update: '2026-10-01T00:00:00Z' });
  assert.equal(s.default, 'BRL');
  assert.deepEqual(s.available, ['USD', 'EUR']);
  assert.deepEqual(s.rates, { USD: 5, EUR: 0.18 });
  assert.equal(s.markup, 50);
  assert.equal(s.maxChangePercent, 20);
  assert.equal(s.rates_source, 'manual');
  assert.equal(s.last_run, '2026-10-01T00:00:00Z');
  assert.equal(normalizeCurrencySettings(null).default, 'BRL');
});

test('moedas pedidas: países ativos, taxas e escolhidas, sem a base', () => {
  const s = normalizeCurrencySettings({ default: 'BRL', rates: { USD: 0.18 }, available: ['GBP'] });
  assert.deepEqual(wantedCurrencies(s, ['BRL', 'EUR', 'EUR']), ['EUR', 'GBP', 'USD']);
});

test('taxa cruzada a partir do euro', () => {
  const ecb = parseEcbXml(ECB_XML);
  // 1 BRL = 1 / 6,1234 EUR
  assert.equal(crossRate(ecb, 'BRL', 'EUR'), roundRate(1 / 6.1234));
  assert.equal(crossRate(ecb, 'BRL', 'USD'), 0.178822);
  assert.equal(crossRate(ecb, 'EUR', 'BRL'), 6.1234);
  assert.equal(crossRate(ecb, 'BRL', 'ARS'), null);
  assert.equal(roundRate(26.512345678), 26.5123);
  assert.equal(changePercent(undefined, 5), 0);
  assert.ok(Math.abs(changePercent(0.2, 0.25) - 25) < 1e-9);
});

test('aplica o BCE: fixadas à mão ficam, moeda sem BCE fica, salto grande espera', () => {
  const ecb = parseEcbXml(ECB_XML);
  const s = normalizeCurrencySettings({ default: 'BRL', rates: { EUR: 0.16, USD: 0.1, GBP: 0.2, ARS: 190 }, manual: ['GBP'] });
  const now = new Date('2026-10-06T16:20:00Z');
  const r = applyEcbRates(s, ecb, wantedCurrencies(s, ['EUR', 'JPY']), { now });
  assert.equal(r.settings.rates.EUR, roundRate(1 / 6.1234));
  assert.equal(r.settings.rates.JPY, 26.513);
  assert.equal(r.settings.rates.USD, 0.1, 'salto de 79% não entra sozinho');
  assert.equal(r.settings.rates.GBP, 0.2);
  assert.equal(r.settings.rates.ARS, 190);
  assert.deepEqual(r.skipped.map((x) => [x.code, x.reason]), [['ARS', 'missing'], ['GBP', 'manual'], ['USD', 'jump']]);
  assert.equal(r.skipped.find((x) => x.code === 'USD').rate, 0.178822);
  assert.equal(r.skipped.find((x) => x.code === 'USD').changePercent, 78.8);
  assert.deepEqual(r.changed.map((c) => c.code), ['EUR', 'JPY']);
  assert.equal(r.settings.last_status, 'partial');
  assert.equal(r.settings.rates_source, 'ecb');
  assert.equal(r.settings.rate_date, '2026-10-06');
  assert.equal(r.settings.last_run, now.toISOString());
  // Com force (o Admin viu o aviso): o salto entra; manual continua.
  const f = applyEcbRates(s, ecb, ['USD', 'GBP'], { force: true });
  assert.equal(f.settings.rates.USD, 0.178822);
  assert.equal(f.settings.rates.GBP, 0.2);
  assert.equal(f.settings.last_status, 'ok');
});

test('conversão com margem igual à do site', () => {
  const s = normalizeCurrencySettings({ default: 'BRL', rates: { EUR: 0.2 }, markup: 5 });
  assert.ok(Math.abs(convertAmount(s, 100, 'EUR') - 21) < 1e-9);
  assert.equal(convertAmount(s, 100, 'BRL'), 100);
  assert.equal(convertAmount(s, 100, 'USD'), null);
});

test('migration: histórico pelo trigger e cron diário com o segredo do Vault', () => {
  const sql = readFileSync('supabase/migrations/20261007020000_exchange_rates.sql', 'utf8');
  assert.ok(sql.includes("'exchange-rates-daily'"));
  assert.ok(sql.includes("'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'"));
  assert.ok(sql.includes('AFTER INSERT OR UPDATE OF value ON public.store_settings'));
  assert.ok(!/\bBEGIN;|\bCOMMIT;/.test(sql));
  const fn = readFileSync('supabase/functions/update-exchange-rates/index.ts', 'utf8');
  assert.ok(fn.includes('auto_exchange_rates !== true'));
  assert.ok(fn.includes('const force = !isCron'));
});

console.log(`\n${n} testes ok`);
