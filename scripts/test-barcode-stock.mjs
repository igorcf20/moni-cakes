// Teste das entradas e conferência com leitor (src/lib/stockEntries.ts) e das etiquetas de produto
// (src/lib/productLabels.ts): leitura de códigos, quantidades por tipo, peça dona do estoque, modelos e HTML da impressão.
// Uso: node --experimental-strip-types scripts/test-barcode-stock.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addScan, cleanScan, entryErrorCode, entryMode, entryTotals, labelsHref, lineResult, lineValue,
} from '../src/lib/stockEntries.ts';
import {
  barcodeReadable, buildStockUnits, DEFAULT_LABEL_SETTINGS, findUnitByCode, labelCode, labelGeometry, labelSlots, labelsPerPage, leafUnits,
  LABEL_PRESETS, normalizeLabelSettings, paginate, PAPER_MM, productLabelsHtml, searchUnits, sheetFits, stockOwner, usesProductId,
} from '../src/lib/productLabels.ts';
import { FEATURES } from '../src/lib/features.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

const products = [
  { id: 'vaso', name: 'Vaso <Facetado>', price: 50, stock_quantity: 9, sku: 'VASO', gtin: null, internal_code: 'INT-1', mpn: 'MPN-9' },
  { id: 'caneca', name: 'Caneca', price: 30, stock_quantity: 4, sku: null, gtin: '7891234567895', internal_code: null, mpn: null },
  { id: 'chaveiro', name: 'Chaveiro', price: 10, stock_quantity: 2, sku: null, gtin: null, internal_code: null, mpn: null },
];
const variations = [
  { id: 'v-azul', product_id: 'vaso', name: 'Azul', price_modifier: 5, stock_quantity: 3, sku: 'VASO-AZUL', gtin: null },
  { id: 'v-preto', product_id: 'vaso', name: 'Preto', price_modifier: 0, stock_quantity: null, sku: null, gtin: null },
];
const sizes = [{ id: 's-m', product_id: 'vaso', size_label: 'M', price_modifier: 2, stock_quantity: 6, sku: 'VASO-M', gtin: '96385074' }];
const matrix = [{ variation_id: 'v-azul', product_size_id: 's-m', price_modifier: 1, stock_quantity: 1, sku: 'VASO-AZUL-M', gtin: null }];
const units = buildStockUnits(products, variations, sizes, matrix);
const by = (key) => units.find((u) => u.key === key);

test('unidades de estoque com preço e códigos herdados', () => {
  assert.equal(units.length, 3 + 2 + 1 + 1);
  assert.equal(by('m:v-azul:s-m').price, 50 + 5 + 2 + 1);
  assert.equal(by('v-preto' && 'v:v-preto').sku, 'VASO');
  assert.equal(by('v:v-preto').skuInherited, true);
  assert.equal(by('m:v-azul:s-m').variant, 'Azul / M');
});

test('leitura: GTIN com ou sem 0, SKU próprio antes do herdado, código interno, marca e id', () => {
  assert.equal(findUnitByCode(units, '7891234567895').key, 'p:caneca');
  assert.equal(findUnitByCode(units, '07891234567895').key, 'p:caneca', 'GTIN-14 com 0 à frente');
  assert.equal(findUnitByCode(units, '96385074').key, 's:s-m');
  assert.equal(findUnitByCode(units, ' vaso-azul ').key, 'v:v-azul', 'sem diferença de maiúsculas e espaços');
  assert.equal(findUnitByCode(units, 'VASO').key, 'p:vaso', 'SKU próprio do produto, não a cor que o herda');
  assert.equal(findUnitByCode(units, 'int-1').key, 'p:vaso');
  assert.equal(findUnitByCode(units, 'MPN-9').key, 'p:vaso');
  assert.equal(findUnitByCode(units, 'chaveiro').key, 'p:chaveiro', 'id do produto (etiqueta sem código)');
  assert.equal(findUnitByCode(units, 'nada'), null);
  assert.deepEqual(searchUnits(units, 'vaso azul').map((u) => u.key), ['v:v-azul', 'm:v-azul:s-m']);
});

test('limpeza do que o leitor digita', () => {
  assert.equal(cleanScan(' VASO-AZUL\r\n'), 'VASO-AZUL');
  assert.equal(cleanScan(']E07891234567895'), '7891234567895', 'prefixo AIM');
  assert.equal(cleanScan('\tABC\u0000'), 'ABC');
});

test('peça dona do estoque: cor sem estoque segue o produto', () => {
  assert.equal(stockOwner(units, by('v:v-preto')).key, 'p:vaso');
  assert.equal(stockOwner(units, by('v:v-azul')).key, 'v:v-azul');
  const noStockCombo = buildStockUnits(products, variations, sizes, [{ ...matrix[0], stock_quantity: null }]);
  assert.equal(stockOwner(noStockCombo, noStockCombo.find((u) => u.key === 'm:v-azul:s-m')).key, 's:s-m', 'combinação sem estoque segue o tamanho');
});

test('lista de leitura: o mesmo código soma e sobe; passo maior para caixas', () => {
  const base = { productId: 'vaso', variationId: 'v-azul', sizeId: null, name: 'Vaso', variant: 'Azul', image: null, code: 'VASO-AZUL', stock: 3 };
  let ls = addScan([], base);
  ls = addScan(ls, { ...base, productId: 'caneca', variationId: null });
  ls = addScan(ls, base, 12);
  assert.equal(ls.length, 2);
  assert.equal(ls[0].qty, 13);
  assert.equal(ls[0].productId, 'vaso');
});

test('quantidades por tipo, valor enviado e totais', () => {
  assert.equal(entryMode('receive'), 'add');
  assert.equal(lineResult('receive', 3, 2), 5);
  assert.equal(lineResult('receive', 3, 0), null);
  assert.equal(lineResult('count', 3, 0), 0);
  assert.equal(lineResult('count', 3, -1), null);
  assert.equal(lineResult('damage', 3, 2), 1);
  assert.equal(lineResult('damage', 3, 4), null, 'não deixa negativo');
  assert.equal(lineResult('other', 3, -3), 0);
  assert.equal(lineResult('other', 3, 0), null);
  assert.equal(lineResult('receive', 3, 1.5), null);
  assert.equal(lineValue('damage', 2), -2);
  assert.equal(lineValue('count', 7), 7);
  const lines = [{ key: 'a', stock: 5, qty: 7 }, { key: 'b', stock: 5, qty: 2 }, { key: 'c', stock: 1, qty: 1 }, { key: 'd', stock: 0, qty: -1 }];
  assert.deepEqual(entryTotals('count', lines), { lines: 4, unitsIn: 2, unitsOut: 3, invalid: 1, differences: 2 });
});

test('erros estáveis e link para as etiquetas', () => {
  assert.equal(entryErrorCode('ERROR: invalid_value'), 'invalid_value');
  assert.equal(entryErrorCode('too_many_lines'), 'too_many_lines');
  assert.equal(entryErrorCode('boom'), 'unknown');
  assert.equal(labelsHref({ entry: 'a b' }), '/admin?tab=barcode-labels&entrada=a%20b');
  assert.equal(labelsHref({ product: 'vaso' }), '/admin?tab=barcode-labels&produto=vaso');
});

test('código da etiqueta: escolhido, senão GTIN, SKU, interno, id do produto', () => {
  assert.equal(labelCode(by('p:caneca'), 'auto'), '7891234567895');
  assert.equal(labelCode(by('p:vaso'), 'internal'), 'INT-1');
  assert.equal(labelCode(by('p:vaso'), 'gtin'), 'VASO', 'sem GTIN usa o SKU');
  assert.equal(labelCode(by('p:chaveiro'), 'auto'), 'chaveiro');
  assert.ok(usesProductId(by('p:chaveiro'), 'auto'));
  assert.ok(!usesProductId(by('p:vaso'), 'auto'));
  // Tudo o que a etiqueta codifica é lido de volta pela mesma peça.
  for (const u of units) for (const s of ['auto', 'gtin', 'sku', 'internal']) {
    const back = findUnitByCode(units, labelCode(u, s));
    assert.ok(back, `${u.key} ${s}`);
  }
});

test('peças que levam etiqueta própria', () => {
  assert.deepEqual(leafUnits(units, 'vaso').map((u) => u.key), ['v:v-azul', 's:s-m', 'm:v-azul:s-m']);
  assert.deepEqual(leafUnits(units, 'caneca').map((u) => u.key), ['p:caneca']);
});

test('modelos: padrão, normalização, medidas próprias e folhas que cabem no papel', () => {
  assert.deepEqual(normalizeLabelSettings(null), DEFAULT_LABEL_SETTINGS);
  const s = normalizeLabelSettings({ preset: 'x', fields: { price: false, bogus: true }, codeSource: 'sku', textSize: 'lg', custom: { w: 9999, sheet: { cols: 0 } } });
  assert.equal(s.preset, DEFAULT_LABEL_SETTINGS.preset);
  assert.equal(s.fields.price, false);
  assert.equal(s.fields.name, true);
  assert.equal('bogus' in s.fields, false);
  assert.equal(s.codeSource, 'sku');
  assert.equal(s.custom.w, 210);
  assert.equal(s.custom.sheet.cols, 1);
  for (const p of LABEL_PRESETS) if (p.sheet) assert.ok(sheetFits(p.sheet), p.id);
  assert.equal(labelsPerPage(labelGeometry({ ...DEFAULT_LABEL_SETTINGS, preset: 'a4_5x13' })), 65);
  assert.equal(labelsPerPage(labelGeometry(DEFAULT_LABEL_SETTINGS)), 1);
  const custom = labelGeometry({ ...DEFAULT_LABEL_SETTINGS, preset: 'custom_roll', custom: { ...DEFAULT_LABEL_SETTINGS.custom, w: 33, h: 22 } });
  assert.deepEqual([custom.kind, custom.w, custom.h], ['roll', 33, 22]);
  assert.ok(!sheetFits({ paper: 'a4', cols: 4, rows: 1, w: 60, h: 30, top: 0, left: 0, gapX: 0, gapY: 0 }));
  assert.equal(PAPER_MM.letter.w, 215.9);
});

test('código longo em etiqueta pequena dá aviso', () => {
  assert.ok(barcodeReadable('7891234567895', { w: 40, h: 25 }));
  assert.ok(!barcodeReadable('PRODUTO-COM-CODIGO-MUITO-LONGO-123', { w: 30, h: 20 }));
});

test('posições e páginas', () => {
  const slots = labelSlots([{ item: 'a', copies: 2 }, { item: 'b', copies: 1 }], 2);
  assert.deepEqual(slots, [null, null, 'a', 'a', 'b']);
  assert.deepEqual(paginate([1, 2, 3], 2), [[1, 2], [3]]);
});

test('HTML da impressão: página do tamanho certo, texto escapado, campos desligados somem', () => {
  const tx = { storeName: 'Loja & Cia', price: (v) => `R$ ${v.toFixed(2)}` };
  const roll = productLabelsHtml([{ unit: by('p:vaso'), copies: 2 }], { ...DEFAULT_LABEL_SETTINGS, fields: { ...DEFAULT_LABEL_SETTINGS.fields, store: true } }, tx);
  assert.match(roll, /@page \{ size: 50mm 30mm; margin: 0; \}/);
  assert.equal((roll.match(/<section class="page">/g) ?? []).length, 2, 'rolo = uma por página');
  assert.ok(roll.includes('Vaso &lt;Facetado&gt;') && !roll.includes('<Facetado>'));
  assert.ok(roll.includes('Loja &amp; Cia'));
  assert.ok(roll.includes('R$ 50.00'));
  assert.ok(roll.includes('<svg'));
  const bare = productLabelsHtml([{ unit: by('p:vaso'), copies: 1 }], { ...DEFAULT_LABEL_SETTINGS, fields: { name: true, variant: false, price: false, code: false, barcode: false, store: false } }, tx);
  assert.ok(!bare.includes('<svg') && !bare.includes('R$') && !bare.includes('class="ct"'));
  const sheet = productLabelsHtml([{ unit: by('p:caneca'), copies: 30 }], { ...DEFAULT_LABEL_SETTINGS, preset: 'a4_3x8' }, tx, { skip: 3 });
  assert.match(sheet, /size: A4/);
  assert.equal((sheet.match(/<section class="page">/g) ?? []).length, 2, '3 vazias + 30 = 33 em folhas de 24');
  assert.equal((sheet.match(/class="lb"/g) ?? []).length, 30);
  assert.ok(sheet.includes('left:0mm;top:37.5mm'), 'quarta posição = segunda linha');
  const one = productLabelsHtml([{ unit: by('p:caneca'), copies: 30 }], { ...DEFAULT_LABEL_SETTINGS, preset: 'a4_3x8' }, tx, { maxPages: 1 });
  assert.equal((one.match(/<section class="page">/g) ?? []).length, 1);
  assert.match(productLabelsHtml([], { ...DEFAULT_LABEL_SETTINGS, preset: 'letter_3x10' }, tx), /size: letter/);
});

test('recursos no catálogo e servidor com a mesma regra de quantidades', () => {
  for (const id of ['barcode_stock', 'barcode_labels']) {
    const f = FEATURES.find((x) => x.id === id);
    assert.ok(f && f.defaultOn && f.category === 'catalog', id);
  }
  const sql = readFileSync(new URL('../supabase/migrations/20261008145000_barcode_stock.sql', import.meta.url), 'utf8');
  assert.match(sql, /_kind IN \('receive', 'damage'\) AND v_qty <= 0/);
  assert.match(sql, /_kind = 'count' AND v_qty < 0/);
  assert.match(sql, /CASE WHEN _kind = 'damage' THEN -v_qty ELSE v_qty END/);
  const i18n = readFileSync(new URL('../src/i18n/adminFeatures.ts', import.meta.url), 'utf8');
  for (const k of ['f_barcode_stock', 'f_barcode_labels']) assert.equal((i18n.match(new RegExp(`${k}: `, 'g')) ?? []).length, 4, `${k} nos 4 idiomas`);
});

console.log(`\n${n} testes ok`);
