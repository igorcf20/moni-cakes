// Teste do catálogo de recursos da loja (src/lib/features.ts).
// Uso: node --experimental-strip-types scripts/test-features.mjs
import assert from 'node:assert/strict';
import { FEATURES, FEATURE_CATEGORIES, FEATURE_PATHS, featureOn, hrefOn, normalizeFlags, sectionVisible } from '../src/lib/features.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

test('ids únicos e categorias conhecidas', () => {
  const ids = FEATURES.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const f of FEATURES) assert.ok(FEATURE_CATEGORIES.includes(f.category), f.id);
});

test('valor gravado ganha do padrão', () => {
  assert.equal(featureOn({}, 'returns'), true);
  assert.equal(featureOn({ returns: false }, 'returns'), false);
  assert.equal(featureOn(null, 'nao-existe'), true);
});

test('seção some com o recurso desligado', () => {
  assert.equal(sectionVisible({}, 'returns'), true);
  assert.equal(sectionVisible({ returns: false }, 'returns'), false);
  assert.equal(sectionVisible({ returns: false }, 'orders'), true);
});

test('limpa valores estranhos', () => {
  assert.deepEqual(normalizeFlags({ returns: false, wishlist: 'sim', lixo: true }), { returns: false });
  assert.deepEqual(normalizeFlags([1, 2]), {});
});

test('links de páginas de recurso', () => {
  assert.equal(hrefOn({ customizer: false }, '/personalizar?x=1'), false);
  assert.equal(hrefOn({ customizer: false, quote_3d: true }, '/orcamento-3d'), true);
  // Moni Cakes: orçamento 3D e personalizador vêm desligados por padrão.
  assert.equal(hrefOn({}, '/orcamento-3d'), false);
  assert.equal(hrefOn({}, '/personalizar'), false);
  assert.equal(hrefOn({ customizer: false }, '/produtos'), true);
  for (const id of Object.values(FEATURE_PATHS)) assert.ok(FEATURES.some((f) => f.id === id), id);
});

console.log(`${n} testes ok`);
