// Teste dos Códigos do produto (src/lib/productCodes.ts) e de Calcular frete no produto (src/lib/shippingEstimate.ts):
// onde cada código aparece, validação do código interno e do código da marca, migration (único, sem BEGIN/COMMIT),
// feed com o código da marca; regras da calculadora, ordem e prazo das opções; textos e recursos.
// Uso: node --experimental-strip-types scripts/test-product-codes.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_PRODUCT_CODES, codesFor, isValidInternalCode, isValidMpn, normalizeInternalCode, normalizeMpn, normalizeProductCodes } from '../src/lib/productCodes.ts';
import { DEFAULT_SHIPPING_ESTIMATE, daysRange, normalizeShippingEstimate, pickEstimateOptions } from '../src/lib/shippingEstimate.ts';
import { FEATURES } from '../src/lib/features.ts';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

test('onde cada código aparece', () => {
  const values = { sku: 'CH-01', internal: 'INT 9', mpn: 'BR-77', gtin: '7891234567895' };
  assert.deepEqual(codesFor(values, DEFAULT_PRODUCT_CODES, 'top').map((c) => c.kind), ['sku']);
  assert.deepEqual(codesFor(values, DEFAULT_PRODUCT_CODES, 'specs').map((c) => c.kind), ['sku', 'mpn']);
  const all = normalizeProductCodes({ sku: 'off', internal: 'top', mpn: 'both', gtin: 'specs' });
  assert.deepEqual(codesFor(values, all, 'top').map((c) => c.kind), ['internal', 'mpn']);
  assert.deepEqual(codesFor(values, all, 'specs').map((c) => c.kind), ['mpn', 'gtin']);
  assert.deepEqual(codesFor({ sku: '  ' }, DEFAULT_PRODUCT_CODES, 'top'), [], 'vazio não aparece');
  assert.deepEqual(normalizeProductCodes({ sku: 'x', internal: 3 }), DEFAULT_PRODUCT_CODES);
});

test('validação do código interno e do código da marca', () => {
  assert.equal(normalizeInternalCode('  A  1 '), 'A 1');
  assert.equal(normalizeInternalCode(''), null);
  assert.ok(isValidInternalCode('EST-2026/01'));
  assert.ok(isValidInternalCode(''));
  assert.ok(!isValidInternalCode('-começa'));
  assert.ok(!isValidInternalCode('x'.repeat(65)));
  assert.equal(normalizeMpn(' AB  12 '), 'AB 12');
  assert.ok(isValidMpn('Ção-12#A'));
  assert.ok(!isValidMpn('<script>'));
});

test('migration dos códigos: único sem diferença de maiúsculas, sem BEGIN/COMMIT', () => {
  const sql = read('supabase/migrations/20261008110000_product_codes.sql');
  assert.match(sql, /UNIQUE INDEX[^;]+lower\(internal_code\)/);
  assert.match(sql, /internal_code_taken/);
  assert.ok(!/\bBEGIN;|\bCOMMIT;|CONCURRENTLY/i.test(sql));
  assert.match(read('supabase/functions/_shared/productFeed.ts'), /mpn/);
  assert.equal(read('src/lib/productFeed.ts').replace(/\r/g, ''), read('supabase/functions/_shared/productFeed.ts').replace(/\r/g, ''), 'cópias do feed iguais');
});

test('calculadora de frete: regras, ordem e prazo', () => {
  assert.deepEqual(normalizeShippingEstimate(null), DEFAULT_SHIPPING_ESTIMATE);
  assert.deepEqual(normalizeShippingEstimate({ product: 'link', showDays: false, maxOptions: 40 }), { product: 'link', showDays: false, maxOptions: 6 });
  const o = (id, price, free, min, max) => ({ service_id: id, price_cents: price, free, days_min: min, days_max: max });
  const list = [o('a', 2500, false, 2, 3), o('b', 1500, false, 5, 8), o('c', 900, true, 6, 10), o('d', 1500, false, 3, 4)];
  assert.deepEqual(pickEstimateOptions(list, 3).map((x) => x.service_id), ['c', 'd', 'b']);
  assert.equal(pickEstimateOptions(list, 0).length, 1);
  assert.deepEqual(daysRange({ days_min: 5, days_max: 2 }), { min: 2, max: 5 });
  assert.deepEqual(daysRange({ days_min: null, days_max: 4 }), { min: 4, max: 4 });
  assert.equal(daysRange({ days_min: null, days_max: null }), null);
});

test('textos nos 4 idiomas e recursos no catálogo', () => {
  for (const f of ['src/i18n/adminProductCodes.ts', 'src/i18n/shippingEstimate.ts']) {
    const src = read(f);
    for (const l of ["'pt-BR'", "'pt-PT'", 'en:', 'es:']) assert.ok(src.includes(l), `${f} ${l}`);
    assert.ok(!src.includes('—'), `${f} sem travessão`);
  }
  const fe = read('src/i18n/adminFeatures.ts');
  for (const id of ['shipping_estimate', 'price_display', 'product_questions']) {
    assert.ok(FEATURES.some((f) => f.id === id), id);
    assert.equal(fe.split(`f_${id}_d:`).length - 1, 4, `f_${id}_d nos 4 idiomas`);
  }
});

console.log(`\n${n} testes ok`);
