// Teste das marcas (src/lib/brands.ts). Uso: node --experimental-strip-types scripts/test-brands.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brandDescription, brandFacets, brandMatcher, brandSlug, parseBrandParam, SLUG_RE, toggleBrand } from '../src/lib/brands.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };
const b = (id, slug, order = 0, name = slug) => ({ id, slug, name, logo_url: null, website: null, description_i18n: {}, is_active: true, display_order: order });
const brands = [b('1', 'vinha-velha', 2, 'Vinha Velha'), b('2', 'adega-sul', 1, 'Adega Sul'), b('3', 'casa-norte', 1, 'Casa Norte')];

test('endereço da marca a partir do nome', () => {
  assert.equal(brandSlug('Château Ávila & Filhos'), 'chateau-avila-filhos');
  assert.ok(SLUG_RE.test(brandSlug('Marca 3D')));
  assert.equal(brandSlug('  --  '), '');
});

test('formato igual ao da migration', () => {
  const sql = readFileSync('supabase/migrations/20261007010000_brands.sql', 'utf8');
  assert.ok(sql.includes("slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'"));
  assert.equal(SLUG_RE.source, '^[a-z0-9]+(-[a-z0-9]+)*$');
});

test('parâmetro da URL', () => {
  assert.deepEqual(parseBrandParam('adega-sul, Vinha-Velha,,x--y,<script>'), ['adega-sul', 'vinha-velha']);
  assert.deepEqual(parseBrandParam(null), []);
  assert.deepEqual(parseBrandParam('a,a'), ['a']);
});

test('marcar e desmarcar', () => {
  assert.deepEqual(toggleBrand(['a'], 'b', true), ['a', 'b']);
  assert.deepEqual(toggleBrand(['a', 'b'], 'a', false), ['b']);
  assert.deepEqual(toggleBrand(['a'], 'a', true), ['a']);
});

test('filtro: OU entre marcas, sem marca não passa, slug desconhecido é ignorado', () => {
  const m = brandMatcher(brands, ['adega-sul', 'casa-norte']);
  assert.equal(m('2'), true);
  assert.equal(m('3'), true);
  assert.equal(m('1'), false);
  assert.equal(m(null), false);
  assert.equal(brandMatcher(brands, [])(null), true);
  assert.equal(brandMatcher(brands, ['nao-existe'])('1'), true);
});

test('contagens por marca, na ordem do Admin e depois pelo nome', () => {
  const items = [{ brandId: '1' }, { brandId: '1' }, { brandId: '2' }, { brandId: null }];
  const f = brandFacets(items, brands, []);
  assert.deepEqual(f.map((x) => [x.brand.slug, x.count]), [['adega-sul', 1], ['vinha-velha', 2]]);
  // escolhida sem produtos continua visível para poder desmarcar
  assert.deepEqual(brandFacets(items, brands, ['casa-norte']).map((x) => x.brand.slug), ['adega-sul', 'casa-norte', 'vinha-velha']);
});

test('descrição por idioma', () => {
  const x = { description_i18n: { 'pt-BR': 'Vinhos do Douro', en: 'Douro wines' } };
  assert.equal(brandDescription(x, 'en'), 'Douro wines');
  assert.equal(brandDescription(x, 'es'), 'Vinhos do Douro');
  assert.equal(brandDescription({ description_i18n: {} }, 'en'), '');
});

console.log(`${n} testes passaram`);
