// Teste do feed de produtos (src/lib/productFeed.ts). Uso: node --experimental-strip-types scripts/test-product-feed.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildFeedItems, categoryKey, DEFAULT_FEED_SETTINGS, feedAmount, feedCountryOn, feedCurrency, feedItemId, feedVariants, feedXml,
  normalizeFeedSettings, normalizeMoney, productIssues, stripHtml, unitBase, xmlEscape,
} from '../src/lib/productFeed.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

const BR = { code: 'BR', currency: 'BRL', taxMode: 'inclusive', taxRate: 0 };
const PT = { code: 'PT', currency: 'EUR', taxMode: 'vat', taxRate: 23 };
const money = normalizeMoney({ default: 'BRL', rates: { EUR: 0.2, USD: 'x' }, markup: 5 });
const now = new Date('2026-10-06T12:00:00Z');
const ctx = (over = {}) => ({
  siteUrl: 'https://loja.exemplo/', storeName: 'Loja Exemplo', country: BR, money, settings: DEFAULT_FEED_SETTINGS,
  colorStock: true, brands: { b1: 'Atelier Norte' }, categoryNames: { decoracao: 'Decoração' }, now, ...over,
});
const prod = (over = {}) => ({
  id: 'p1', slug: 'vaso', name: 'Vaso', description: '<p>Vaso <b>facetado</b></p><p>PLA</p>', price: 100, stock_quantity: 5,
  image: '/images/vaso.webp', images: ['https://cdn.exemplo/v2.webp'], category: 'Decoração', brand_id: 'b1', sku: null, gtin: null, weight: 0.4, ...over,
});

test('cópia igual na função product-feed', () => {
  assert.equal(readFileSync('src/lib/productFeed.ts', 'utf8'), readFileSync('supabase/functions/_shared/productFeed.ts', 'utf8'));
});

test('regras normalizadas', () => {
  const s = normalizeFeedSettings({ countries: ['br', 'xx1', 'PT', 'BR'], variants: 'sim', condition: 'velho', categoryMap: { 'Decoração': ' 696 ', vazio: '' }, excludedCategories: ['Casa'], excludedProducts: ['a', 'a', 3] });
  assert.deepEqual(s.countries, ['BR', 'PT']);
  assert.equal(s.variants, true);
  assert.equal(s.condition, 'new');
  assert.deepEqual(s.categoryMap, { decoracao: '696' });
  assert.deepEqual(s.excludedCategories, ['casa']);
  assert.deepEqual(s.excludedProducts, ['a']);
  assert.deepEqual(normalizeFeedSettings(null), DEFAULT_FEED_SETTINGS);
  assert.ok(feedCountryOn(s, 'pt') && !feedCountryOn(s, 'ES'));
  assert.ok(feedCountryOn(DEFAULT_FEED_SETTINGS, 'ES'));
  assert.equal(categoryKey('  Organização & Casa '), 'organizacao-casa');
});

test('moeda e imposto como o site', () => {
  assert.deepEqual(normalizeMoney({ default: 'BRL', rates: { EUR: 0.2, USD: 'x' }, markup: 5 }).rates, { EUR: 0.2 });
  assert.deepEqual(feedCurrency(BR, money), { currency: 'BRL', factor: 1, converted: false });
  const eur = feedCurrency(PT, money);
  assert.equal(eur.currency, 'EUR');
  assert.ok(Math.abs(eur.factor - 0.21) < 1e-9);
  // 100 líquido + 23% de IVA, x 0,2 x 1,05 = 25,83
  assert.deepEqual(feedAmount(100, { country: PT, money }), { amount: 25.83, currency: 'EUR' });
  // Sem taxa de câmbio para dólar: fica na moeda base.
  assert.deepEqual(feedAmount(100, { country: { code: 'US', currency: 'USD', taxMode: 'inclusive', taxRate: 0 }, money }), { amount: 100, currency: 'BRL' });
  assert.deepEqual(feedAmount(1234.5, { country: { code: 'JP', currency: 'JPY', taxMode: 'inclusive', taxRate: 0 }, money: { base: 'BRL', rates: { JPY: 30.1 }, markup: 0 } }), { amount: 37158, currency: 'JPY' });
});

test('preço de 1 unidade usa o escalão que vale para 1', () => {
  const p = prod();
  assert.equal(unitBase(p, []), 100);
  assert.equal(unitBase(p, [{ product_id: 'p1', min_meters: 1, price_per_meter: 90 }, { product_id: 'p1', min_meters: 10, price_per_meter: 70 }]), 90);
  assert.equal(unitBase(p, [{ product_id: 'p2', min_meters: 1, price_per_meter: 50 }]), 100);
});

test('variantes: matriz, cores com estoque próprio, tamanhos e personalizável', () => {
  const p = prod();
  const colors = [{ id: 'c1', product_id: 'p1', name: 'Preto', price_modifier: 5, image_url: '/preto.webp', stock_quantity: null }, { id: 'c2', product_id: 'p1', name: 'Azul', price_modifier: 0, sku: 'VASO-AZUL', stock_quantity: 0 }];
  const sizes = [{ id: 's1', product_id: 'p1', size_label: 'P', price_modifier: 0, stock_quantity: 3 }, { id: 's2', product_id: 'p1', size_label: 'G', price_modifier: 10, stock_quantity: 0 }];
  const combos = [
    { variation_id: 'c1', product_size_id: 's2', is_available: true, stock_quantity: 4, price_modifier: 12, sku: 'VASO-PRETO-G', gtin: '7891234567895', image_url: '/preto-g.webp' },
    { variation_id: 'c2', product_size_id: 's1', is_available: false, stock_quantity: 9 },
  ];
  const v = feedVariants(p, colors, sizes, combos, true);
  assert.deepEqual(v.map((x) => x.key), ['c1:s1', 'c1:s2', 'c2:s2']);
  assert.deepEqual(v.map((x) => x.stock), [3, 4, 0]);
  assert.deepEqual(v.map((x) => x.modifier), [5, 17, 10]);
  assert.equal(v[1].image, '/preto-g.webp');
  assert.equal(v[0].image, '/preto.webp');
  // Só cores: estoque próprio só com o recurso variants; vazio usa o do produto.
  assert.deepEqual(feedVariants(p, colors, [], [], true).map((x) => x.stock), [5, 0]);
  assert.deepEqual(feedVariants(p, colors, [], [], false).map((x) => x.stock), [5, 5]);
  assert.deepEqual(feedVariants(p, [], sizes, [], true).map((x) => [x.sizeLabel, x.stock]), [['P', 3], ['G', 0]]);
  assert.deepEqual(feedVariants(prod({ customizable: true }), [], sizes, [], true).map((x) => x.stock), [null, null]);
  assert.deepEqual(feedVariants(prod({ stock_quantity: null }), [], [], [], true)[0].stock, null);
});

test('problemas do produto', () => {
  const v = feedVariants(prod(), [], [], [], true);
  assert.deepEqual(productIssues(prod(), v, ctx()), ['no_gtin']);
  const bare = prod({ image: null, images: [], price: 0, description: ' <p></p> ', brand_id: null, name: 'x'.repeat(151) });
  assert.deepEqual(productIssues(bare, feedVariants(bare, [], [], [], true), ctx({ settings: { ...DEFAULT_FEED_SETTINGS, brandFallback: false } })),
    ['no_image', 'no_price', 'no_description', 'no_brand', 'no_gtin', 'title_long']);
  assert.equal(stripHtml('<p>Um&nbsp;<b>vaso</b></p><script>x()</script><p>dois</p>'), 'Um vaso\ndois');
});

test('linha de produto simples: preço, marca, fotos, link e identificadores', () => {
  const { items, skipped } = buildFeedItems({ products: [prod()] }, ctx());
  assert.equal(skipped.length, 0);
  const it = items[0];
  assert.equal(it.id, 'p1');
  assert.equal(it.item_group_id, undefined);
  assert.equal(it.title, 'Vaso');
  assert.equal(it.description, 'Vaso facetado\nPLA');
  assert.equal(it.link, 'https://loja.exemplo/produto/vaso?pais=BR');
  assert.equal(it.image_link, 'https://loja.exemplo/images/vaso.webp');
  assert.deepEqual(it.additional_image_link, ['https://cdn.exemplo/v2.webp']);
  assert.equal(it.price, '100.00 BRL');
  assert.equal(it.availability, 'in_stock');
  assert.equal(it.brand, 'Atelier Norte');
  assert.equal(it.identifier_exists, 'no');
  assert.equal(it.product_type, 'Decoração');
  assert.equal(it.shipping_weight, '0.4 kg');
  assert.equal(it.condition, 'new');
  // Sem marca: o nome da loja; com SKU e marca: mpn.
  const other = buildFeedItems({ products: [prod({ brand_id: null, sku: 'VASO-1' })] }, ctx()).items[0];
  assert.equal(other.brand, 'Loja Exemplo');
  assert.equal(other.mpn, 'VASO-1');
  assert.equal(other.id, 'VASO-1');
  assert.equal(other.identifier_exists, undefined);
});

test('promoção vira sale_price com a data de fim; categoria do Google', () => {
  const p = prod({ promo_active: true, promo_type: 'percentage', promo_value: 20, promo_ends_at: '2026-10-31T00:00:00Z' });
  const settings = normalizeFeedSettings({ defaultGoogleCategory: '536', categoryMap: { decoracao: '696' } });
  const it = buildFeedItems({ products: [p] }, ctx({ settings, country: PT })).items[0];
  assert.equal(it.price, '25.83 EUR');
  assert.equal(it.sale_price, '20.66 EUR');
  assert.equal(it.sale_price_effective_date, '2026-10-06T12:00:00.000Z/2026-10-31T00:00:00.000Z');
  assert.equal(it.google_product_category, '696');
  assert.equal(it.link, 'https://loja.exemplo/produto/vaso?pais=PT');
  const other = buildFeedItems({ products: [prod({ category: 'Casa' })] }, ctx({ settings })).items[0];
  assert.equal(other.google_product_category, '536');
  // Promoção vencida ou futura: sem sale_price.
  const old = buildFeedItems({ products: [prod({ promo_active: true, promo_value: 20, promo_ends_at: '2026-10-01T00:00:00Z' })] }, ctx()).items[0];
  assert.equal(old.sale_price, undefined);
});

test('uma linha por variante, agrupadas, com link que escolhe a variante', () => {
  const colors = [{ id: 'c1', product_id: 'p1', name: 'Preto', price_modifier: 5 }];
  const sizes = [{ id: 's1', product_id: 'p1', size_label: 'P', stock_quantity: 3 }, { id: 's2', product_id: 'p1', size_label: 'G', price_modifier: 10, stock_quantity: 0 }];
  const data = { products: [prod()], colors, sizes, combos: [] };
  const { items } = buildFeedItems(data, ctx());
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.item_group_id === 'p1'));
  assert.notEqual(items[0].id, items[1].id);
  assert.equal(items[0].id, feedItemId('p1', { key: 'c1:s1', sku: null }, false));
  assert.equal(items[0].title, 'Vaso (Preto / P)');
  assert.equal(items[1].price, '115.00 BRL');
  assert.equal(items[1].availability, 'out_of_stock');
  assert.equal(items[0].color, 'Preto');
  assert.equal(items[1].size, 'G');
  assert.equal(items[0].link, 'https://loja.exemplo/produto/vaso?pais=BR&cor=c1&tamanho=s1');
  // Sem esgotados: a linha G sai; todas esgotadas = produto fora com o motivo.
  const noOut = normalizeFeedSettings({ includeOutOfStock: false });
  assert.equal(buildFeedItems(data, ctx({ settings: noOut })).items.length, 1);
  const allOut = buildFeedItems({ ...data, sizes: sizes.map((s) => ({ ...s, stock_quantity: 0 })) }, ctx({ settings: noOut }));
  assert.deepEqual(allOut.skipped.map((s) => s.reason), ['out_of_stock']);
  // Uma linha por produto: menor acréscimo, em estoque se alguma variante estiver.
  const one = buildFeedItems(data, ctx({ settings: normalizeFeedSettings({ variants: false }) })).items;
  assert.equal(one.length, 1);
  assert.equal(one[0].price, '105.00 BRL');
  assert.equal(one[0].availability, 'in_stock');
  assert.equal(one[0].item_group_id, undefined);
});

test('fora do feed: tirado, categoria, sem foto ou preço', () => {
  const settings = normalizeFeedSettings({ excludedProducts: ['p2'], excludedCategories: ['casa'] });
  const { items, skipped } = buildFeedItems({ products: [
    prod(), prod({ id: 'p2' }), prod({ id: 'p3', category: 'Casa' }), prod({ id: 'p4', image: null, images: [] }), prod({ id: 'p5', price: 0 }),
  ] }, ctx({ settings }));
  assert.deepEqual(items.map((i) => i.productId), ['p1']);
  assert.deepEqual(skipped.map((s) => [s.productId, s.reason]), [['p2', 'excluded'], ['p3', 'category'], ['p4', 'no_image'], ['p5', 'no_price']]);
});

test('códigos curtos e estáveis até 50 caracteres', () => {
  const long = 'x'.repeat(60);
  const a = feedItemId(long, { key: 'k', sku: null }, true);
  assert.ok(a.length <= 50);
  assert.equal(a, feedItemId(long, { key: 'k', sku: null }, true));
  assert.equal(feedItemId('p1', { key: 'k', sku: 'S'.repeat(70) }, false).length, 50);
});

test('XML válido e escapado', () => {
  const { items } = buildFeedItems({ products: [prod({ name: 'Vaso <grande> & "bonito"', description: 'Linha\u0001 um' })] }, ctx());
  const xml = feedXml(items, { title: 'Loja & Cia', link: 'https://loja.exemplo', description: 'Tudo' });
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">'));
  assert.ok(xml.includes('<title>Loja &amp; Cia</title>'));
  assert.ok(xml.includes('<title>Vaso &lt;grande&gt; &amp; &quot;bonito&quot;</title>'));
  assert.ok(xml.includes('<g:price>100.00 BRL</g:price>'));
  assert.ok(xml.includes('<g:additional_image_link>https://cdn.exemplo/v2.webp</g:additional_image_link>'));
  assert.ok(!xml.includes('productId'));
  assert.ok(!xml.includes('\u0001'));
  assert.equal(xmlEscape("a'b"), 'a&apos;b');
  assert.equal((xml.match(/<item>/g) ?? []).length, 1);
});

test('função product-feed sem JWT e recurso desligado por padrão', () => {
  const toml = readFileSync('supabase/config.toml', 'utf8');
  assert.match(toml, /\[functions\.product-feed\]\nverify_jwt = false/);
  const fn = readFileSync('supabase/functions/product-feed/index.ts', 'utf8');
  assert.ok(fn.includes('flags.product_feed !== true'));
  const features = readFileSync('src/lib/features.ts', 'utf8');
  assert.match(features, /id: 'product_feed', category: 'marketing', defaultOn: false/);
});

console.log(`\n${n} testes ok`);
