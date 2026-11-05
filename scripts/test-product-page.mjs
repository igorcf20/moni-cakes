// Regras da página do produto (store_settings.product_page): normalização, modelos e disponibilidade.
// node --experimental-strip-types scripts/test-product-page.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLASSIC_PRODUCT_PAGE, DEFAULT_PRODUCT_PAGE, availabilityFor, normalizeProductPage, sameProductPage } from '../src/lib/productPage.ts';

// Sem valor guardado ou com lixo: o padrão.
assert.deepEqual(normalizeProductPage(undefined), DEFAULT_PRODUCT_PAGE);
assert.deepEqual(normalizeProductPage('x'), DEFAULT_PRODUCT_PAGE);
assert.deepEqual(normalizeProductPage({ actions: 'huge', details: 1, trust: { style: 'x', on: 'yes' } }), DEFAULT_PRODUCT_PAGE);
// Valores válidos ficam.
const n = normalizeProductPage({ actions: 'full', details: 'tabs', desktop_bar: false, trust: { on: false, style: 'list' } });
assert.equal(n.actions, 'full');
assert.equal(n.details, 'tabs');
assert.equal(n.desktop_bar, false);
assert.equal(n.trust.on, false);
assert.equal(n.trust.style, 'list');
assert.equal(n.trust.payments, true, 'o que falta vem do padrão');
// Modelos distintos e idempotentes.
assert.ok(!sameProductPage(DEFAULT_PRODUCT_PAGE, CLASSIC_PRODUCT_PAGE));
assert.deepEqual(normalizeProductPage(CLASSIC_PRODUCT_PAGE), CLASSIC_PRODUCT_PAGE);

// Disponibilidade.
const base = { ready: true, soldOut: false, stockControlled: true, stock: 20, madeToOrder: false };
assert.deepEqual(availabilityFor(base), { kind: 'in_stock' });
assert.deepEqual(availabilityFor({ ...base, stock: 3 }), { kind: 'low', count: 3 });
assert.deepEqual(availabilityFor({ ...base, stock: null }), { kind: 'in_stock' }, 'combinação ainda por escolher');
assert.equal(availabilityFor({ ...base, ready: false }), null, 'sem estoque carregado não diz nada');
assert.equal(availabilityFor({ ...base, soldOut: true }), null, 'esgotado tem o seu próprio aviso');
assert.deepEqual(availabilityFor({ ...base, stockControlled: false, madeToOrder: true }), { kind: 'made_to_order' });
assert.equal(availabilityFor({ ...base, stockControlled: false }), null, 'sem estoque nem prazo: nada inventado');

// Textos nos 4 idiomas.
for (const f of ['src/i18n/productPage.ts', 'src/i18n/adminProductPage.ts']) {
  const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  for (const loc of ["'pt-PT'", 'en:', 'es:']) assert.ok(src.includes(loc), `${f} sem ${loc}`);
  assert.ok(!/[—]/.test(src), `${f} com travessão`);
}
console.log('test-product-page: ok');
