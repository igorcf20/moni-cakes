// Teste do pedido de orçamento B2B (src/lib/quotes.ts, migration, preço no servidor, telas e textos).
// Uso: node --experimental-strip-types scripts/test-quotes.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  QUOTE_ERRORS, addDaysISO, canBuy, discounted, normalizeQuoteSettings, quoteCartLine, quoteDraftErrors, quoteErrorOf,
  quotePayloadItems, quoteRef, quoteTotals, quoteView,
} from '../src/lib/quotes.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };
const read = (p) => readFileSync(p, 'utf8');
const MIG = read('supabase/migrations/20261007150000_quotes.sql');
const keys = (s) => new Set([...s.matchAll(/^\s+([a-z0-9_]+): '/gm)].map((m) => m[1]));
const sameKeys = (file) => {
  const src = read(file);
  const block = (start, end) => src.slice(src.indexOf(start), end ? src.indexOf(end) : undefined);
  const br = keys(block('const ptBR', 'export type'));
  for (const [name, s] of [['en', block('  en: {', '  es: {')], ['es', block('  es: {')]]) {
    const k = keys(s);
    assert.deepEqual([...br].filter((x) => !k.has(x)), [], `${file} ${name} sem chaves em falta`);
  }
  assert.match(block("  'pt-PT': {", '  en: {'), /\.\.\.ptBR/);
  assert.doesNotMatch(src, /—/, 'sem travessão');
  return br;
};

test('estado, validade e compra', () => {
  const today = '2026-10-06';
  assert.equal(quoteView({ status: 'sent', valid_until: '2026-10-05' }, today), 'expired');
  assert.equal(quoteView({ status: 'sent', valid_until: today }, today), 'sent');
  assert.equal(quoteView({ status: 'ordered', valid_until: '2020-01-01' }, today), 'ordered');
  assert.equal(canBuy({ status: 'accepted', valid_until: today, order_id: null }, today), true);
  assert.equal(canBuy({ status: 'accepted', valid_until: today, order_id: 'x' }, today), false);
  assert.equal(canBuy({ status: 'new', valid_until: null, order_id: null }, today), false);
  assert.equal(addDaysISO(15, new Date(2026, 9, 20)), '2026-11-04');
  assert.equal(quoteRef(1001), 'ORC-1001');
});

test('totais, desconto e linha do carrinho', () => {
  const items = [{ quantity: 10, list_price: 20, unit_price: 15 }, { quantity: 5, list_price: 9.9, unit_price: 8 }];
  assert.deepEqual(quoteTotals(items), { list: 249.5, offer: 190, units: 15, saving: 23.8 });
  assert.equal(quoteTotals([{ quantity: 2, list_price: 10, unit_price: null }]).offer, null);
  assert.equal(discounted(19.9, 10), 17.91);
  assert.equal(discounted(10, 150), 0);
  const line = quoteCartLine({ id: 'q1' }, { id: 'i1', product_id: 'p1', name: 'Vaso', image: null, variation_id: 'v1', variation_name: 'Azul', size_label: null, quantity: 50, list_price: 20, target_price: null, note: null, unit_price: 14.5 });
  assert.deepEqual(line.designData.quote, { id: 'q1', item_id: 'i1', unit: 14.5 });
  assert.equal(line.quantity, 50);
  assert.equal(line.variationId, 'v1');
  assert.equal(line.sizeLabel, undefined);
});

test('regras e formulário', () => {
  assert.deepEqual(normalizeQuoteSettings(null), { valid_days: 15, product_button: true, cart_button: true, min_quantity: 1 });
  assert.deepEqual(normalizeQuoteSettings({ valid_days: 900, product_button: false, min_quantity: 0 }), { valid_days: 365, product_button: false, cart_button: true, min_quantity: 1 });
  assert.deepEqual(quoteDraftErrors({ contact: ' ', items: [] }), ['contact', 'items']);
  assert.deepEqual(quoteDraftErrors({ contact: 'Ana', items: [{ quantity: 0, target_price: 'x' }] }, 1), ['quantity', 'target', 'min_quantity']);
  assert.deepEqual(quoteDraftErrors({ contact: 'Ana', items: [{ quantity: 30, target_price: '' }] }, 50), ['min_quantity']);
  assert.deepEqual(quoteDraftErrors({ contact: 'Ana', items: [{ quantity: 60, target_price: '12,5' }] }, 50), []);
  const [p] = quotePayloadItems([{ key: 'k', product_id: 'p', name: 'x', image: null, list_price: 1, variation_id: null, variation_name: null, size_label: 'M', quantity: 3, target_price: '12,345', note: '  ' }]);
  assert.deepEqual(p, { product_id: 'p', quantity: 3, variation_id: null, size_label: 'M', target_price: 12.35, note: null });
});

test('erros estáveis e textos', () => {
  assert.equal(quoteErrorOf('ERROR: invalid_status'), 'invalid_status');
  assert.equal(quoteErrorOf('invalid'), 'invalid');
  assert.equal(quoteErrorOf('boom'), 'unknown');
  const site = sameKeys('src/i18n/quotes.ts');
  for (const c of QUOTE_ERRORS) assert.ok(site.has(`err_${c}`), `err_${c}`);
  assert.ok(site.has('err_unknown'));
  const admin = sameKeys('src/i18n/adminQuotes.ts');
  for (const s of ['new', 'sent', 'accepted', 'ordered', 'declined', 'rejected', 'cancelled', 'expired']) assert.ok(admin.has(`st_${s}`) && site.has(`st_${s}`), s);
});

test('migration: regras no banco', () => {
  assert.doesNotMatch(MIG, /\bBEGIN;|\bCOMMIT;|CONCURRENTLY/);
  for (const t of ['quote_requests', 'quote_items']) assert.match(MIG, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`), t);
  assert.match(MIG, /REVOKE ALL ON public\.quote_requests, public\.quote_items FROM anon, authenticated;/);
  for (const code of QUOTE_ERRORS) assert.match(MIG, new RegExp(`RAISE EXCEPTION '${code}'`), code);
  for (const f of ['request_quote', 'my_quotes', 'accept_quote', 'decline_quote', 'admin_quote_send', 'admin_quote_reject']) {
    assert.match(MIG, new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon;`), f);
  }
  for (const f of ['order_items_quote', 'orders_quote_release']) assert.match(MIG, new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\(\\) FROM PUBLIC, anon, authenticated;`), f);
  assert.match(MIG, /feature_enabled\('quotes', false\)/);
});

test('preço da proposta só pelo servidor', () => {
  const pricing = read('supabase/functions/_shared/pricing.ts');
  assert.match(pricing, /async function quoteUnits\(/);
  assert.match(pricing, /if \(quoted\.units\[lineIdx\] != null\) unit = quoted\.units\[lineIdx\]!;/);
  assert.match(pricing, /orderId: order\.id/);
  const cart = read('src/hooks/useCart.tsx');
  assert.match(cart, /\.is\("design_data->quote", null\)/);
});

test('recurso, rotas, menu, conta e textos', () => {
  assert.match(read('src/lib/features.ts'), /id: 'quotes', category: 'sales', defaultOn: false, sections: \['quotes'\]/);
  assert.match(read('src/lib/features.ts'), /'\/pedido-de-orcamento': 'quotes'/);
  assert.match(read('src/components/admin/shell/adminSections.ts'), /value: "quotes", icon: ClipboardList, badge: \(a\) => a\.quoteRequests/);
  assert.match(read('src/pages/Admin.tsx'), /quotes: <AdminQuotes \/>/);
  assert.match(read('src/App.tsx'), /path="\/pedido-de-orcamento" element=\{<FeatureRoute feature="quotes">/);
  assert.match(read('src/pages/Dashboard.tsx'), /\{ id: "orcamentos", Icon: ClipboardList, group: "shop" \}/);
  assert.match(read('src/pages/ProductDetail.tsx'), /<QuoteProductLink /);
  assert.match(read('src/pages/Cart.tsx'), /<QuoteCartPrompt /);
  assert.match(read('src/lib/activityLog.ts'), /'quote_requests', 'quote_items'/);
  for (const [f, ks] of [['src/i18n/adminFeatures.ts', ['f_quotes', 'f_quotes_d']], ['src/i18n/admin.ts', ['s_quotes', 'd_quotes']], ['src/i18n/adminActivity.ts', ['e_quote_requests', 'e_quote_items']], ['src/i18n/account.ts', ['sec_orcamentos', 'sec_orcamentos_hint']]]) {
    for (const k of ks) assert.ok(read(f).split(`${k}:`).length >= 4, `${f} ${k} em pt-BR, en e es`);
  }
  assert.doesNotMatch(read('src/components/admin/AdminQuotes.tsx'), /Dialog|confirm\(/, 'sem janelas no Admin');
});

console.log(`test-quotes: ${n} testes ok`);
