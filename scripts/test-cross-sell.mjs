// Teste da venda cruzada (src/lib/crossSell.ts). Uso:
// node --experimental-strip-types scripts/test-cross-sell.mjs
import assert from 'node:assert/strict';
import { linkCounts, mergeSuggestions, moveItem, normalizeCrossSellSettings, rankCrossSells } from '../src/lib/crossSell.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

test('regras com padrões e limites', () => {
  assert.deepEqual(normalizeCrossSellSettings(null), { cartLimit: 4, fillWithFeatured: true, sideCart: true, relatedOnProduct: true });
  assert.equal(normalizeCrossSellSettings({ cartLimit: 99 }).cartLimit, 12);
  assert.equal(normalizeCrossSellSettings({ cartLimit: 0 }).cartLimit, 1);
  assert.equal(normalizeCrossSellSettings({ cartLimit: 'x', sideCart: false }).sideCart, false);
});

const L = (p, r, o, kind = 'cross_sell') => ({ product_id: p, related_product_id: r, display_order: o, kind });

test('ordem: mais itens do carrinho, depois a ordem do Admin', () => {
  const links = [L('a', 'x', 0), L('a', 'y', 1), L('b', 'y', 0), L('b', 'z', 2), L('a', 'b', 2), L('c', 'w', 0), L('a', 'r', 0, 'related')];
  assert.deepEqual(rankCrossSells(links, ['a', 'b'], 10), ['y', 'x', 'z']);
  assert.deepEqual(rankCrossSells(links, ['a', 'b'], 2), ['y', 'x']);
  assert.deepEqual(rankCrossSells(links, [], 4), []);
});

test('juntar escolhidas e automáticas', () => {
  assert.deepEqual(mergeSuggestions(['x', 'y'], ['y', 'z', 'a', 'b'], 4, ['a']), ['x', 'y', 'z', 'b']);
  assert.deepEqual(mergeSuggestions([], ['p'], 3, ['p']), []);
});

test('mover e contar', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(moveItem(['a', 'b'], 0, -1), ['a', 'b']);
  const c = linkCounts([L('a', 'x', 0), L('a', 'y', 0, 'related'), L('a', 'z', 1)]);
  assert.deepEqual(c.get('a'), { cross_sell: 2, related: 1 });
});

console.log(`${n} testes passaram`);
