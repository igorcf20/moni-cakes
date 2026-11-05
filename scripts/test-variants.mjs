// Teste das variantes (src/lib/variants.ts). Uso:
// node --experimental-strip-types scripts/test-variants.mjs
import assert from 'node:assert/strict';
import {
  fillMissingSkus, gtinChecksumOk, isValidGtin, isValidSku, pickVariant, rowStock, suggestSku, variantCsvRows, variantLabel, variantRows, variantSummary,
} from '../src/lib/variants.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

const P = { id: 'vaso', name: 'Vaso', sku: 'VASO', gtin: null, stock_quantity: 7 };
const C = [{ id: 'c1', name: 'Preto', color_hex: '#000000', image_url: 'https://x/p.webp', sku: null, stock_quantity: null }, { id: 'c2', name: 'Laranja claro', color_hex: '#ff5a0a', sku: 'VASO-LAR', stock_quantity: 3 }];
const S = [{ id: 's1', size_label: 'P', stock_quantity: 4, sku: 'VASO-P' }, { id: 's2', size_label: 'M', stock_quantity: 0 }];
const M = [{ variation_id: 'c1', product_size_id: 's1', is_available: true, stock_quantity: 2, sku: 'VASO-PRETO-P', image_url: 'https://x/pp.webp' },
  { variation_id: 'c2', product_size_id: 's2', is_available: false, stock_quantity: 9 }];

test('códigos: formato e dígito verificador', () => {
  assert.ok(isValidSku('VASO-01/a.b_c'));
  assert.ok(isValidSku(''));
  assert.ok(!isValidSku('-VASO'));
  assert.ok(!isValidSku('com espaço'));
  assert.ok(isValidGtin('7891234567895'));
  assert.ok(!isValidGtin('123'));
  assert.ok(gtinChecksumOk('4006381333931'));
  assert.ok(!gtinChecksumOk('4006381333932'));
  assert.ok(gtinChecksumOk('96385074'));
});

test('sugestão de código sem acentos', () => {
  assert.equal(suggestSku('vaso-facetado', ['Azul claro', 'GG']), 'VASOFACETADO-AZULCLARO-GG');
  assert.equal(suggestSku('Pão', ['Coração']), 'PAO-CORACAO');
});

test('combinações cor x tamanho', () => {
  const rows = variantRows(P, C, S, M);
  assert.equal(rows.length, 4);
  const pp = rows.find((r) => r.key === 'c1:s1');
  assert.equal(pp.sku, 'VASO-PRETO-P');
  assert.equal(pp.image, 'https://x/pp.webp');
  assert.equal(pp.stock, 2);
  const pm = rows.find((r) => r.key === 'c1:s2');
  assert.equal(pm.isDefault, true);
  assert.equal(pm.image, 'https://x/p.webp');
  assert.equal(pm.ownImage, null);
  assert.equal(pp.ownImage, 'https://x/pp.webp');
  assert.equal(pm.stock, 0);
  assert.equal(rows.find((r) => r.key === 'c2:s2').available, false);
  assert.equal(variantLabel(pp), 'Preto / P');
  assert.equal(pickVariant(rows, 'c1', null), null);
  assert.equal(pickVariant(rows, 'c1', 's1').key, 'c1:s1');
  const sum = variantSummary(rows, P.stock_quantity);
  assert.deepEqual(sum, { total: 4, stock: 2 + 0 + 4, soldOut: 1, low: 2, missingSku: 3, unavailable: 1 });
});

test('só cores: estoque próprio ou do produto', () => {
  const rows = variantRows(P, C, [], []);
  assert.equal(rows[0].kind, 'color');
  assert.equal(rows[0].stock, null);
  assert.equal(rowStock(rows[0], 7), 7);
  assert.equal(rows[1].stock, 3);
  assert.equal(variantSummary(rows, 7).stock, 10);
  assert.equal(pickVariant(rows, 'c2', null).sku, 'VASO-LAR');
});

test('só tamanhos e produto simples', () => {
  const rows = variantRows(P, [], S, []);
  assert.equal(rows.length, 2);
  assert.equal(pickVariant(rows, null, 's1').sku, 'VASO-P');
  const one = variantRows(P, [], [], []);
  assert.equal(one[0].kind, 'product');
  assert.equal(pickVariant(one, null, null).sku, 'VASO');
});

test('preencher códigos sem repetir', () => {
  const rows = variantRows(P, C, S, M);
  const out = fillMissingSkus(rows, 'VASO', ['VASO-LARANJACLARO-P']);
  assert.equal(out.size, 3);
  assert.equal(out.get('c1:s2'), 'VASO-PRETO-M');
  assert.equal(out.get('c2:s1'), 'VASO-LARANJACLARO-P-2');
  assert.ok(!out.has('c1:s1'));
});

test('CSV', () => {
  const rows = variantCsvRows(variantRows(P, C, [], []), 7, 'Vaso');
  assert.deepEqual(rows[0], { variant: 'Preto', sku: '', gtin: '', stock: 7, available: 1 });
});

console.log(`${n} testes passaram`);
