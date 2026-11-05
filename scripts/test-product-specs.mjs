// Teste das especificações e filtros (src/lib/productSpecs.ts). Uso:
// node --experimental-strip-types scripts/test-product-specs.mjs
import assert from 'node:assert/strict';
import {
  buildSpecIndex, parseSpecParams, productSpecRows, specCount, specFacets, specMatcher, specSlug, specText, toggleSpec, writeSpecParams,
} from '../src/lib/productSpecs.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

const opt = (id, attribute_id, slug, label, color = null) => ({ id, attribute_id, slug, label_i18n: { 'pt-BR': label }, color, sort_order: 0 });
const ATTRS = [
  { id: 'a1', slug: 'material', name_i18n: { 'pt-BR': 'Material', en: 'Material' }, unit: null, show_in_filters: true, show_on_product: true, sort_order: 0,
    options: [opt('o1', 'a1', 'pla', 'PLA'), opt('o2', 'a1', 'petg', 'PETG'), opt('o3', 'a1', 'resina', 'Resina')] },
  { id: 'a2', slug: 'cor', name_i18n: { 'pt-BR': 'Cor', en: 'Color' }, unit: null, show_in_filters: true, show_on_product: false, sort_order: 1,
    options: [opt('o4', 'a2', 'preto', 'Preto', '#000000'), { ...opt('o5', 'a2', 'laranja', 'Laranja', '#ff5a0a'), label_i18n: { 'pt-BR': 'Laranja', en: 'Orange' } }] },
  { id: 'a3', slug: 'altura', name_i18n: { 'pt-BR': 'Altura' }, unit: 'cm', show_in_filters: false, show_on_product: true, sort_order: 2,
    options: [opt('o6', 'a3', '14', '14')] },
];
const ROWS = [
  { product_id: 'p1', option_id: 'o1' }, { product_id: 'p1', option_id: 'o4' }, { product_id: 'p1', option_id: 'o6' },
  { product_id: 'p2', option_id: 'o2' }, { product_id: 'p2', option_id: 'o5' },
  { product_id: 'p3', option_id: 'o1' }, { product_id: 'p3', option_id: 'o5' },
  { product_id: 'p4', option_id: 'x-desconhecido' },
];
const index = buildSpecIndex(ROWS, ATTRS);

test('textos por idioma com recurso ao pt-BR', () => {
  assert.equal(specText({ 'pt-BR': 'Cor', en: 'Color' }, 'en'), 'Color');
  assert.equal(specText({ 'pt-BR': 'Cor' }, 'es'), 'Cor');
  assert.equal(specText({ en: ' Only ' }, 'pt-PT'), 'Only');
  assert.equal(specText({}, 'en', 'x'), 'x');
  assert.equal(specSlug('Tamanho da Peça (cm)'), 'tamanho-da-peca-cm');
});

test('parâmetros da URL', () => {
  const sel = parseSpecParams(new URLSearchParams('f_material=pla,petg,pla&f_cor=&f_BAD=x&q=vaso&f_altura=14'));
  assert.deepEqual(sel, { material: ['pla', 'petg'], altura: ['14'] });
  const out = writeSpecParams(new URLSearchParams('q=vaso&f_velho=1'), { material: ['pla'], cor: [] });
  assert.equal(out.toString(), 'q=vaso&f_material=pla');
  assert.equal(specCount(sel), 3);
  assert.deepEqual(toggleSpec({ material: ['pla'] }, 'material', 'pla', false), {});
  assert.deepEqual(toggleSpec({}, 'cor', 'preto', true), { cor: ['preto'] });
});

test('filtro: E entre características, OU entre valores', () => {
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];
  assert.deepEqual(ids.filter(specMatcher(index, {})), ids);
  assert.deepEqual(ids.filter(specMatcher(index, { material: ['pla'] })), ['p1', 'p3']);
  assert.deepEqual(ids.filter(specMatcher(index, { material: ['pla', 'petg'] })), ['p1', 'p2', 'p3']);
  assert.deepEqual(ids.filter(specMatcher(index, { material: ['pla'], cor: ['laranja'] })), ['p3']);
  assert.deepEqual(ids.filter(specMatcher(index, { material: ['pla'], cor: ['laranja'] }, 'cor')), ['p1', 'p3']);
});

test('contagens dos filtros ignoram o próprio filtro', () => {
  const facets = specFacets(['p1', 'p2', 'p3', 'p4'], index, ATTRS, { material: ['pla'] });
  assert.deepEqual(facets.map((f) => f.attribute.slug), ['material', 'cor']);
  const mat = Object.fromEntries(facets[0].options.map((o) => [o.option.slug, [o.count, o.checked]]));
  assert.deepEqual(mat, { pla: [2, true], petg: [1, false] });
  const cor = Object.fromEntries(facets[1].options.map((o) => [o.option.slug, o.count]));
  assert.deepEqual(cor, { preto: 1, laranja: 1 });
});

test('ficha do produto', () => {
  assert.deepEqual(productSpecRows(['o1', 'o4', 'o6'], ATTRS, 'pt-BR'), [{ label: 'Material', value: 'PLA' }, { label: 'Altura', value: '14 cm' }]);
  assert.deepEqual(productSpecRows([], ATTRS, 'en'), []);
});

console.log(`test-product-specs: ${n} testes passaram`);
