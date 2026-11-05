// Kits (recurso kits): textos por idioma, período, preços, peças esgotadas, linhas do carrinho com cor e tamanho,
// "Complete o kit", rotas, textos e a migration da página do kit.
// node --experimental-strip-types scripts/test-kits.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FEATURES, FEATURE_PATHS, featureOn } from '../src/lib/features.ts';
import { completeKits, kitCartLines, kitPct } from '../src/lib/kitPricing.ts';
import { DEFAULT_KIT_SETTINGS, normalizeKitSettings, kitHighlights, kitHref, kitIsLive, kitMissing, kitPhotos, kitPrices, kitsForLooseLines, kitText, pieceSoldOut } from '../src/lib/kits.ts';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok', name); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const kit = {
  id: 'k1', slug: 'kit-sala', name: 'Kit Sala', description: 'Resumo', discount_type: 'percentage', discount_value: 10,
  name_i18n: { en: 'Living room kit', es: '' }, highlights: '- Combina\n\n* Mais barato \n', highlights_i18n: { en: 'Matches' },
  image_url: 'a.jpg', gallery: ['b.jpg', 'a.jpg', '', 3],
};

test('recurso ligado por padrão, página e rota do kit', () => {
  assert.ok(FEATURES.some((f) => f.id === 'kits' && f.defaultOn));
  assert.equal(FEATURE_PATHS['/kits'], 'kits');
  assert.equal(featureOn({ kits: false }, 'kits'), false);
  assert.match(read('src/App.tsx'), /path="\/kit\/:slug" element=\{<FeatureRoute feature="kits">/);
  assert.equal(kitHref(kit), '/kit/kit-sala');
  assert.equal(kitHref({ id: 'x', slug: null }), '/kit/x');
});

test('textos por idioma com volta ao padrão', () => {
  assert.equal(kitText(kit, 'name', 'en'), 'Living room kit');
  assert.equal(kitText(kit, 'name', 'es'), 'Kit Sala');
  assert.equal(kitText(kit, 'description', 'en'), 'Resumo');
  assert.deepEqual(kitHighlights(kit, 'pt-BR'), ['Combina', 'Mais barato']);
  assert.deepEqual(kitHighlights(kit, 'en'), ['Matches']);
  assert.deepEqual(kitPhotos(kit), ['a.jpg', 'b.jpg']);
});

test('período de validade', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  assert.equal(kitIsLive({ is_active: true }, now), true);
  assert.equal(kitIsLive({ is_active: false }, now), false);
  assert.equal(kitIsLive({ is_active: true, starts_at: '2026-10-09T00:00:00Z' }, now), false);
  assert.equal(kitIsLive({ is_active: true, ends_at: '2026-10-08T12:00:00Z' }, now), false);
  assert.equal(kitIsLive({ is_active: true, starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-10-31T00:00:00Z' }, now), true);
});

test('preços: percentual do preço de tabela, total com escolhas', () => {
  const p = kitPrices(kit, [{ list: 100, unit: 100, quantity: 1 }, { list: 50, unit: 60, quantity: 2 }]);
  assert.equal(p.pct, 0.1);
  assert.equal(p.original, 220);
  assert.ok(Math.abs(p.final - 198) < 1e-9);
  const fixed = kitPrices({ discount_type: 'fixed', discount_value: 20 }, [{ list: 100, unit: 100, quantity: 1 }]);
  assert.equal(fixed.pct, 0.2);
  assert.equal(kitPct('fixed', 500, 100), 1);
});

test('peça esgotada ou fora de venda', () => {
  assert.equal(pieceSoldOut(null), true);
  assert.equal(pieceSoldOut({ id: 'a', name: 'A', price: 1, is_active: false }), true);
  assert.equal(pieceSoldOut({ id: 'a', name: 'A', price: 1, stock_quantity: 0 }), true);
  assert.equal(pieceSoldOut({ id: 'a', name: 'A', price: 1, stock_quantity: null }), false);
  assert.equal(pieceSoldOut({ id: 'a', name: 'A', price: 1, stock_quantity: 3 }), false);
});

test('linhas do carrinho levam marca do kit, cor, tamanho e selectionPricing', () => {
  const lines = kitCartLines({ id: 'k1', name: 'Kit', discount_type: 'percentage', discount_value: 15 }, [
    { product: { id: 'p1', name: 'Vaso', price: 100 }, quantity: 2, variationId: 'v1', variationName: 'Azul', colorHex: '#00f', sizeLabel: 'G', basePrice: 90, modifier: 5, tierRatio: 0.9 },
    { product: { id: 'p2', name: 'Prato', price: 40 }, quantity: 1, basePrice: 40, modifier: 0, tierRatio: 1 },
  ]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].variationId, 'v1');
  assert.equal(lines[0].sizeLabel, 'G');
  assert.equal(lines[0].designData.variation, 'Azul');
  assert.equal(lines[0].designData.size, 'G');
  assert.equal(lines[0].designData.price, 95);
  assert.deepEqual(lines[0].designData.selectionPricing, { version: 1, basePrice: 90, modifier: 5, tierRatio: 0.9 });
  assert.equal(lines[1].designData.variation, undefined);
  const tag = lines[0].designData.kit;
  assert.equal(tag.pct, 0.15);
  assert.deepEqual(tag.items, [{ product_id: 'p1', quantity: 2 }, { product_id: 'p2', quantity: 1 }]);
  const cart = lines.map((l) => ({ product_id: l.productId, quantity: l.quantity, kit: l.designData.kit }));
  assert.ok(completeKits(cart).has('k1'));
});

test('complete o kit: o que falta e produtos soltos', () => {
  const tag = { id: 'k1', name: 'Kit', pct: 0.1, items: [{ product_id: 'p1', quantity: 2 }, { product_id: 'p2', quantity: 1 }] };
  assert.deepEqual(kitMissing([{ product_id: 'p1', quantity: 1, kit: tag }], tag), [{ product_id: 'p1', quantity: 1 }, { product_id: 'p2', quantity: 1 }]);
  assert.deepEqual(kitMissing([{ product_id: 'p1', quantity: 2, kit: tag }, { product_id: 'p2', quantity: 1, kit: tag }], tag), []);
  // sem a marca do kit a peça não conta
  assert.deepEqual(kitMissing([{ product_id: 'p2', quantity: 1 }], tag).length, 2);
  const links = [{ kit_id: 'k1', product_id: 'p1' }, { kit_id: 'k2', product_id: 'p3' }];
  assert.deepEqual(kitsForLooseLines([{ product_id: 'p1' }, { product_id: 'p9' }], links), ['k1']);
  assert.deepEqual(kitsForLooseLines([{ product_id: 'p1', kit: tag }], links), []);
});

test('textos em 4 idiomas, sem travessões', () => {
  const src = read('src/i18n/kits.ts');
  const base = src.slice(src.indexOf('const ptBR = {'), src.indexOf('};'));
  const keys = [...base.matchAll(/^  ([a-z_]+): /gm)].map((m) => m[1]);
  assert.ok(keys.length > 40);
  const en = src.slice(src.indexOf('  en: {'), src.indexOf('  es: {'));
  const es = src.slice(src.indexOf('  es: {'));
  for (const k of keys) {
    assert.match(en, new RegExp(`\\n    ${k}: `), `en sem ${k}`);
    assert.match(es, new RegExp(`\\n    ${k}: `), `es sem ${k}`);
  }
  assert.ok(!src.includes('\u2014'), 'travessão');
});

test('migration: colunas, política com período e recurso, números só para admin', () => {
  const sql = read('supabase/migrations/20261008020000_kit_pages.sql');
  for (const col of ['slug', 'name_i18n', 'long_description', 'highlights', 'gallery', 'show_on_home', 'starts_at', 'ends_at', 'seo_title']) assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`));
  assert.match(sql, /USING \(public\.kit_is_live\(is_active, starts_at, ends_at\)\)/);
  assert.match(sql, /feature_enabled\('kits', true\)/);
  assert.match(sql, /admin_kit_stats[\s\S]*has_role\(auth\.uid\(\), 'admin'\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.admin_kit_stats\(timestamptz\) FROM PUBLIC, anon/);
  assert.match(read('supabase/functions/_shared/pricing.ts'), /feature_enabled", \{ _key: "kits"/);
  assert.match(read('supabase/functions/_shared/pricing.ts'), /kit\.ends_at && Date\.parse\(kit\.ends_at\) <= now/);
});

test('onde oferecer: padrões, limites e lixo', () => {
  assert.deepEqual(normalizeKitSettings(null), DEFAULT_KIT_SETTINGS);
  assert.equal(DEFAULT_KIT_SETTINGS.checkout, false);
  assert.equal(DEFAULT_KIT_SETTINGS.productPage, true);
  const s = normalizeKitSettings({ productPage: false, productPageLimit: 9, checkout: true, sideCart: 'sim' });
  assert.equal(s.productPage, false);
  assert.equal(s.productPageLimit, 3);
  assert.equal(s.checkout, true);
  assert.equal(s.sideCart, false);
  assert.equal(normalizeKitSettings({ productPageLimit: 0 }).productPageLimit, 1);
});

test('telas respeitam as regras: produto, carrinho, gaveta, checkout, rodapé', () => {
  assert.match(read('src/components/product/ProductKitOffer.tsx'), /settings\.productPage/);
  const hints = read('src/components/cart/CartKitHints.tsx');
  assert.match(hints, /settings\.cartComplete/);
  assert.match(hints, /settings\.cartLoose/);
  assert.match(hints, /settings\.sideCart/);
  assert.match(hints, /settings\.checkout/);
  assert.match(read('src/components/CartSheet.tsx'), /<CartKitHints[^>]*place="side"/);
  assert.match(read('src/pages/Checkout.tsx'), /<CartKitHints[^>]*place="checkout"/);
  assert.match(read('src/components/Footer.tsx'), /kitSettings\.footerLink/);
  assert.match(read('src/components/home/HomeKits.tsx'), /className="shell/);
});

console.log(`${n} testes ok`);
