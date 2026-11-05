// Teste de Comparar produtos (src/lib/compare.ts): limite, ligar e desligar, tirar, repetidos e lixo do aparelho;
// textos de src/i18n/compare.ts nos 4 idiomas; recurso 'compare' no catálogo de recursos.
// Uso: node --experimental-strip-types scripts/test-compare.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMPARE_LIMIT, DEFAULT_COMPARE_SETTINGS, DISCREET_COMPARE_SETTINGS, isDiscreetCompare, normalizeCompareSettings, addCompareId, allEqual, cleanCompareIds, removeCompareId, toggleCompareId } from '../src/lib/compare.ts';
import { FEATURES, FEATURE_PATHS } from '../src/lib/features.ts';
import { COOKIE_REGISTRY } from '../src/lib/privacy.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

test('limite de 4 produtos', () => {
  assert.equal(COMPARE_LIMIT, 4);
  let ids = [];
  for (const id of ['a', 'b', 'c', 'd']) ids = addCompareId(ids, id).ids;
  assert.deepEqual(ids, ['a', 'b', 'c', 'd']);
  const r = addCompareId(ids, 'e');
  assert.equal(r.result, 'full');
  assert.deepEqual(r.ids, ids);
  assert.equal(toggleCompareId(ids, 'e').result, 'full');
});

test('ligar e desligar', () => {
  const a = toggleCompareId([], 'x');
  assert.deepEqual(a, { ids: ['x'], result: 'added' });
  const b = toggleCompareId(a.ids, 'x');
  assert.deepEqual(b, { ids: [], result: 'removed' });
  // lista cheia ainda deixa tirar
  assert.deepEqual(toggleCompareId(['a', 'b', 'c', 'd'], 'b'), { ids: ['a', 'c', 'd'], result: 'removed' });
});

test('tirar e repetidos', () => {
  assert.deepEqual(removeCompareId(['a', 'b'], 'a'), { ids: ['b'], result: 'removed' });
  assert.equal(removeCompareId(['a'], 'z').result, 'unchanged');
  assert.deepEqual(addCompareId(['a'], 'a'), { ids: ['a'], result: 'unchanged' });
  assert.deepEqual(addCompareId(['a'], '  '), { ids: ['a'], result: 'unchanged' });
});

test('lista do aparelho limpa', () => {
  assert.deepEqual(cleanCompareIds(['a', 'a', ' b ', 3, null, '', 'c', 'd', 'e']), ['a', 'b', 'c', 'd']);
  for (const v of [null, undefined, 'a', {}, 5]) assert.deepEqual(cleanCompareIds(v), []);
});

test('só diferenças', () => {
  assert.equal(allEqual(['PLA', 'pla ']), true);
  assert.equal(allEqual(['PLA', 'PETG']), false);
  assert.equal(allEqual(['', 'PLA']), false);
});

test('textos nos 4 idiomas', () => {
  const src = readFileSync(new URL('../src/i18n/compare.ts', import.meta.url), 'utf8');
  const ptBR = src.slice(src.indexOf('const ptBR = {'), src.indexOf('};', src.indexOf('const ptBR = {')));
  const keys = [...ptBR.matchAll(/^\s{2}(\w+): '/gm)].map((m) => m[1]);
  assert.ok(keys.length > 20);
  for (const lang of ['en', 'es']) {
    const start = src.indexOf(`\n  ${lang}: {`);
    assert.ok(start > 0, lang);
    const block = src.slice(start, src.indexOf('\n  },', start));
    for (const k of keys) assert.ok(new RegExp(`\\n\\s{4}${k}: '`).test(block), `${lang}.${k}`);
  }
  assert.ok(src.includes("'pt-PT': {\n    ...ptBR,"), 'pt-PT herda o pt-BR');
  assert.ok(!src.includes('—'), 'sem travessões');
});

test('recurso e item guardado registados', () => {
  const f = FEATURES.find((x) => x.id === 'compare');
  assert.ok(f, 'compare em FEATURES');
  assert.equal(f.category, 'catalog');
  assert.equal(f.defaultOn, true);
  assert.equal(FEATURE_PATHS['/comparar'], 'compare');
  assert.ok(COOKIE_REGISTRY.preferences.some((i) => i.name === 'loja3d-compare'));
  const admin = readFileSync(new URL('../src/i18n/adminFeatures.ts', import.meta.url), 'utf8');
  assert.equal((admin.match(/\bf_compare: '/g) || []).length, 3); // pt-PT herda o nome do pt-BR
  assert.equal((admin.match(/\bf_compare_d: '/g) || []).length, 4);
});

test('regras de exibição: padrão, modo discreto e valores inválidos', () => {
  assert.deepEqual(normalizeCompareSettings(undefined), DEFAULT_COMPARE_SETTINGS);
  assert.deepEqual(normalizeCompareSettings({ card: 'x', product: 1, bar: null }), DEFAULT_COMPARE_SETTINGS);
  assert.deepEqual(normalizeCompareSettings(DISCREET_COMPARE_SETTINGS), DISCREET_COMPARE_SETTINGS);
  assert.equal(isDiscreetCompare(DISCREET_COMPARE_SETTINGS), true);
  assert.equal(isDiscreetCompare(DEFAULT_COMPARE_SETTINGS), false);
  assert.equal(normalizeCompareSettings({ card: 'off' }).card, 'off');
  const toggle = readFileSync(new URL('../src/components/compare/CompareToggle.tsx', import.meta.url), 'utf8');
  assert.match(toggle, /style === 'off'/);
  assert.match(toggle, /style === 'heart'/);
  assert.match(toggle, /style === 'text'/);
  assert.match(readFileSync(new URL('../src/components/compare/CompareBar.tsx', import.meta.url), 'utf8'), /settings\.bar === 'compact'/);
  const f = FEATURES.find((x) => x.id === 'compare');
  assert.equal(f.configSection, 'compare');
});

console.log(`${n} testes ok`);
