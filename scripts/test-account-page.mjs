// Regras da área do cliente (store_settings.account_page): normalização, modelos, aviso de conta pronta,
// "Comprar tudo de novo" e ordem dos favoritos.
// node --experimental-strip-types scripts/test-account-page.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CLASSIC_ACCOUNT_PAGE, DEFAULT_ACCOUNT_PAGE, normalizeAccountPage, rebuyLines, sameAccountPage, showReadiness, sortFavorites,
} from '../src/lib/accountPage.ts';

// Sem valor guardado ou com lixo: o padrão.
assert.deepEqual(normalizeAccountPage(undefined), DEFAULT_ACCOUNT_PAGE);
assert.deepEqual(normalizeAccountPage([1]), DEFAULT_ACCOUNT_PAGE);
assert.deepEqual(normalizeAccountPage({ header: 'huge', stats: 2, summary: 'x', order_items: null }), DEFAULT_ACCOUNT_PAGE);
// Valores válidos ficam; o que falta vem do padrão.
const n = normalizeAccountPage({ header: 'large', stats: 'off', readiness: 'never', summary: { create: false } });
assert.equal(n.header, 'large');
assert.equal(n.stats, 'off');
assert.equal(n.readiness, 'auto', 'valor inválido volta ao padrão');
assert.equal(n.summary.create, false);
assert.equal(n.summary.buy_again, true);
// Modelos distintos e estáveis.
assert.ok(!sameAccountPage(DEFAULT_ACCOUNT_PAGE, CLASSIC_ACCOUNT_PAGE));
assert.deepEqual(normalizeAccountPage(CLASSIC_ACCOUNT_PAGE), CLASSIC_ACCOUNT_PAGE);

// Aviso "Conta pronta para comprar".
assert.equal(showReadiness('auto', 75), true);
assert.equal(showReadiness('auto', 100), false);
assert.equal(showReadiness('always', 100), true);
assert.equal(showReadiness('off', 25), false);

// Comprar tudo de novo: só catálogo sem escolhas; mesmo produto soma.
assert.deepEqual(rebuyLines([
  { product_id: 'a', quantity: 2, design_data: {} },
  { product_id: 'a', quantity: 1 },
  { product_id: 'b', quantity: 0 },
  { product_id: null, quantity: 1 },
  { product_id: 'c', quantity: 1, design_data: { customization: { areas: [] } } },
  { product_id: 'd', quantity: 1, design_data: { rental: { start: 'x' } } },
  { product_id: 'e', quantity: 1, design_data: { subscription: { plan_id: 'p' } } },
  { product_id: 'f', quantity: 1, design_data: { quote: { id: 'q' } } },
  { product_id: 'g', quantity: 1, design_data: { preorder: true } },
]), [{ productId: 'a', quantity: 3 }, { productId: 'b', quantity: 1 }]);

// Favoritos: ordem e filtro sem mexer na lista original; sem preço vai para o fim.
const cards = [{ id: 1, amount: 50 }, { id: 2, amount: 10, discountPct: 20 }, { id: 3, amount: null }, { id: 4, amount: 30 }];
assert.deepEqual(sortFavorites(cards, 'recent').map((c) => c.id), [1, 2, 3, 4]);
assert.deepEqual(sortFavorites(cards, 'price_asc').map((c) => c.id), [2, 4, 1, 3]);
assert.deepEqual(sortFavorites(cards, 'price_desc').map((c) => c.id), [1, 4, 2, 3]);
assert.deepEqual(sortFavorites(cards, 'recent', true).map((c) => c.id), [2]);
assert.deepEqual(cards.map((c) => c.id), [1, 2, 3, 4]);

// Textos nos 4 idiomas, sem travessões.
for (const f of ['src/i18n/accountPage.ts', 'src/i18n/adminAccountPage.ts']) {
  const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  for (const loc of ["'pt-PT'", 'en:', 'es:']) assert.ok(src.includes(loc), `${f} sem ${loc}`);
  assert.ok(!/[—]/.test(src), `${f} com travessão`);
}
console.log('test-account-page: ok');
