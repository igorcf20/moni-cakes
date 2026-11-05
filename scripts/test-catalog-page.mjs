// Regras da página de catálogo (src/lib/catalogPage.ts).
// node --experimental-strip-types scripts/test-catalog-page.mjs
import assert from 'node:assert/strict';
import { CLASSIC_CATALOG_PAGE, DEFAULT_CATALOG_PAGE, catalogGrid, normalizeCatalogPage, sameCatalogPage } from '../src/lib/catalogPage.ts';

assert.deepEqual(normalizeCatalogPage(undefined), DEFAULT_CATALOG_PAGE, 'sem valor = padrão');
assert.deepEqual(normalizeCatalogPage('lixo'), DEFAULT_CATALOG_PAGE, 'lixo = padrão');
assert.deepEqual(normalizeCatalogPage({ header: 'x', card: 'y', columns: 7, filters: 1, shortcuts: 'sim' }), DEFAULT_CATALOG_PAGE, 'valores fora da lista = padrão');
assert.equal(normalizeCatalogPage({ columns: 3 }).columns, 3);
assert.equal(normalizeCatalogPage({ card: 'photo' }).card, 'photo');
assert.equal(normalizeCatalogPage({ featured_badge: true }).featured_badge, true);
assert.deepEqual(normalizeCatalogPage(CLASSIC_CATALOG_PAGE), CLASSIC_CATALOG_PAGE, 'Clássico sobrevive à normalização');
assert.ok(!sameCatalogPage(DEFAULT_CATALOG_PAGE, CLASSIC_CATALOG_PAGE));
assert.ok(sameCatalogPage(DEFAULT_CATALOG_PAGE, { ...DEFAULT_CATALOG_PAGE }));

// A grade e as colunas usadas no "Carregar mais" têm de bater (cada classe lg/xl/2xl corresponde a uma largura em cols).
const BP = { lg: 1024, xl: 1280, '2xl': 1536, md: 768 };
for (const columns of [3, 4]) {
  for (const filters of ['sidebar', 'button']) {
    const g = catalogGrid({ columns, filters });
    const fromClass = [...g.className.matchAll(/(md|lg|xl|2xl):grid-cols-(\d)/g)].map(([, bp, n]) => [BP[bp], Number(n)]).sort((a, b) => b[0] - a[0]);
    const fromCols = g.cols.map(([q, n]) => [Number(q.match(/(\d+)px/)[1]), n]);
    assert.deepEqual(fromCols, fromClass, `colunas = classes (${columns}, ${filters})`);
    assert.ok(g.className.includes('grid-cols-2'), 'celular com 2 colunas');
  }
}
assert.equal(catalogGrid({ columns: 4, filters: 'sidebar' }).cols.find(([q]) => q.includes('1280'))[1], 4, '4 por linha no computador com filtros');
assert.equal(catalogGrid({ columns: 3, filters: 'sidebar' }).cols.find(([q]) => q.includes('1280')), undefined, '3 por linha até 1536px');

console.log('catalog-page: ok');
