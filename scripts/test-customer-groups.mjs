// Teste dos grupos de clientes e tabelas de preço (src/lib/customerGroups.ts e a cópia das funções). Uso:
// node --experimental-strip-types scripts/test-customer-groups.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  groupDisplayName, groupUnitPrice, normalizeGroupPricing, pickGroupPrice, validPriceRows,
} from '../src/lib/customerGroups.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

const pricing = normalizeGroupPricing({
  group: { id: 'g1', name: 'Revenda', name_i18n: { en: 'Resellers', es: ' ' }, discount_percent: '10' },
  prices: [
    { product_id: 'vaso', min_quantity: 1, price: 30 },
    { product_id: 'vaso', min_quantity: 10, price: 25 },
    { product_id: 'caneca', min_quantity: 0, price: '12.5' },
  ],
});

test('site e funções usam o mesmo ficheiro', () => {
  assert.equal(readFileSync('src/lib/customerGroups.ts', 'utf8'), readFileSync('supabase/functions/_shared/customerGroups.ts', 'utf8'));
});

test('dados normalizados', () => {
  assert.deepEqual(normalizeGroupPricing(null), { group: null, prices: [] });
  assert.equal(normalizeGroupPricing({ group: { id: 'x', discount_percent: 150 } }).group.discount_percent, 90);
  assert.equal(normalizeGroupPricing({ group: { id: 'x', discount_percent: -5 } }).group.discount_percent, 0);
  // sem grupo, os preços não valem
  assert.deepEqual(normalizeGroupPricing({ group: null, prices: [{ product_id: 'a', price: 1 }] }).prices, []);
  assert.equal(pricing.prices.find((p) => p.product_id === 'caneca').min_quantity, 1);
  assert.deepEqual(pricing.group.name_i18n, { en: 'Resellers' });
});

test('nome para o cliente por idioma', () => {
  assert.equal(groupDisplayName(pricing.group, 'en'), 'Resellers');
  assert.equal(groupDisplayName(pricing.group, 'en-US'), 'Resellers');
  assert.equal(groupDisplayName(pricing.group, 'es'), 'Revenda');
  assert.equal(groupDisplayName(null, 'pt-BR'), '');
});

test('linha da tabela pela quantidade', () => {
  assert.equal(pickGroupPrice(pricing.prices, 'vaso', 1).price, 30);
  assert.equal(pickGroupPrice(pricing.prices, 'vaso', 9).price, 30);
  assert.equal(pickGroupPrice(pricing.prices, 'vaso', 10).price, 25);
  assert.equal(pickGroupPrice(pricing.prices, 'outro', 10), null);
});

test('preço da tabela substitui o desconto e soma cor e tamanho', () => {
  const r = groupUnitPrice(pricing, { productId: 'vaso', quantity: 10, base: 40, modifier: 5 });
  assert.deepEqual(r, { unit: 30, source: 'price_list' });
});

test('promoção ou escalão menor que a tabela: vale o menor', () => {
  const r = groupUnitPrice(pricing, { productId: 'vaso', quantity: 1, base: 28, modifier: 2 });
  assert.deepEqual(r, { unit: 30, source: 'catalog' });
});

test('sem preço na tabela: desconto geral sobre a linha inteira', () => {
  const r = groupUnitPrice(pricing, { productId: 'outro', quantity: 3, base: 50, modifier: 10 });
  assert.deepEqual(r, { unit: 54, source: 'discount' });
});

test('personalizado: só o desconto geral', () => {
  const r = groupUnitPrice(pricing, { productId: 'vaso', quantity: 10, base: 100, modifier: 0, customized: true });
  assert.deepEqual(r, { unit: 90, source: 'discount' });
});

test('sem grupo ou grupo sem desconto: preço do catálogo', () => {
  assert.deepEqual(groupUnitPrice({ group: null, prices: [] }, { productId: 'vaso', quantity: 1, base: 40, modifier: 0 }), { unit: 40, source: 'catalog' });
  const zero = normalizeGroupPricing({ group: { id: 'g', name: 'X', discount_percent: 0 }, prices: [] });
  assert.deepEqual(groupUnitPrice(zero, { productId: 'vaso', quantity: 1, base: 40, modifier: 0 }), { unit: 40, source: 'catalog' });
});

test('nunca encarece: tabela acima do catálogo vale o catálogo', () => {
  const high = normalizeGroupPricing({ group: { id: 'g', name: 'X', discount_percent: 20 }, prices: [{ product_id: 'vaso', min_quantity: 1, price: 99 }] });
  assert.deepEqual(groupUnitPrice(high, { productId: 'vaso', quantity: 1, base: 40, modifier: 0 }), { unit: 40, source: 'catalog' });
});

test('validação da tabela', () => {
  assert.equal(validPriceRows([{ product_id: 'a', min_quantity: 1, price: 0 }, { product_id: 'a', min_quantity: 5, price: 2 }]), true);
  assert.equal(validPriceRows([{ product_id: 'a', min_quantity: 1, price: 1 }, { product_id: 'a', min_quantity: 1, price: 2 }]), false);
  assert.equal(validPriceRows([{ product_id: 'a', min_quantity: 0, price: 1 }]), false);
  assert.equal(validPriceRows([{ product_id: 'a', min_quantity: 1.5, price: 1 }]), false);
  assert.equal(validPriceRows([{ product_id: 'a', min_quantity: 1, price: -1 }]), false);
  assert.equal(validPriceRows([{ product_id: 'a', min_quantity: 1, price: NaN }]), false);
});

test('servidor usa a mesma conta', () => {
  const src = readFileSync('supabase/functions/_shared/pricing.ts', 'utf8');
  assert.ok(src.includes('from "./customerGroups.ts"'));
  assert.ok(/priceItems\(sb, cleanItems, \{ userId: user\.id \}\)/.test(readFileSync('supabase/functions/create-order/index.ts', 'utf8')));
});

console.log(`${n} testes passaram`);
