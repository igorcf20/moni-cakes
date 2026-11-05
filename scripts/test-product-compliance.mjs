// Teste das regras de preço e segurança dos produtos (src/lib/productCompliance.ts).
//   node --experimental-strip-types scripts/test-product-compliance.mjs
// O cálculo do menor preço dos últimos 30 dias é feito na base (product_lowest_prices, migration
// 20261006160000_price_history_omnibus.sql) e testado com deploy/test-migrations.sh.
import assert from 'node:assert/strict';
import {
  DEFAULT_COMPLIANCE, appliesTo, normalizeCompliance, normalizeSafetyInfo, resolveSafety,
} from '../src/lib/productCompliance.ts';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`ok ${name}`); };

ok('valor vazio ou estranho = padrões', () => {
  for (const v of [null, undefined, 'x', 3, [], {}]) assert.deepEqual(normalizeCompliance(v), DEFAULT_COMPLIANCE);
});

ok('modos desconhecidos voltam ao padrão', () => {
  const c = normalizeCompliance({ lowest_price_30d: 'sim', safety_show: 'never', warnings: 7 });
  assert.equal(c.lowest_price_30d, 'eu');
  assert.equal(c.safety_show, 'never');
  assert.equal(c.warnings, '');
});

ok('UE: Portugal e Espanha sim, Brasil e EUA não', () => {
  assert.equal(appliesTo('eu', 'PT'), true);
  assert.equal(appliesTo('eu', 'es'), true);
  assert.equal(appliesTo('eu', 'BR'), false);
  assert.equal(appliesTo('eu', 'US'), false);
  assert.equal(appliesTo('always', 'BR'), true);
  assert.equal(appliesTo('never', 'PT'), false);
});

ok('dados do produto ganham aos da loja, campo a campo do bloco', () => {
  const store = normalizeCompliance({
    manufacturer: { name: 'Loja', address: 'Rua A', contact: 'a@a.pt' },
    responsible: { name: 'Resp UE', address: 'Lisboa', contact: '' },
    warnings: 'Manter longe do calor.',
  });
  const own = resolveSafety({ manufacturer: { name: 'Fábrica X', address: '', contact: '' }, model: 'Lote 7' }, store, 'SKU1');
  assert.equal(own.manufacturer.name, 'Fábrica X');
  assert.equal(own.responsible.name, 'Resp UE');
  assert.equal(own.warnings, 'Manter longe do calor.');
  assert.equal(own.model, 'Lote 7');
  const fallback = resolveSafety({}, store, 'SKU1');
  assert.equal(fallback.manufacturer.name, 'Loja');
  assert.equal(fallback.model, 'SKU1');
  assert.equal(fallback.any, true);
});

ok('sem dados em lado nenhum = nada a mostrar', () => {
  const r = resolveSafety(null, DEFAULT_COMPLIANCE, null);
  assert.equal(r.any, false);
  assert.equal(r.manufacturer, null);
  assert.deepEqual(normalizeSafetyInfo({ manufacturer: { name: ' ' }, warnings: '  ' }), {});
});

console.log(`${n} testes ok`);
