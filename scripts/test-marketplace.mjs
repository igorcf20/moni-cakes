// Teste do marketplace com vendedores (src/lib/marketplace.ts, migration, telas e textos).
// Uso: node --experimental-strip-types scripts/test-marketplace.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MARKETPLACE_ERRORS, applicationErrors, marketplaceErrorOf, normalizeMarketplaceSettings, normalizeTotals, shipToLines, splitSale,
  vendorDescription, vendorDraftErrors, vendorSlug,
} from '../src/lib/marketplace.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };
const read = (p) => readFileSync(p, 'utf8');
const MIG = read('supabase/migrations/20261007130000_marketplace.sql');
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

test('comissão e parte do vendedor (igual ao servidor)', () => {
  assert.deepEqual(splitSale(100, 15), { commission: 15, net: 85 });
  assert.deepEqual(splitSale(149.9, 15), { commission: 22.49, net: 127.41 });
  assert.deepEqual(splitSale(10, 0), { commission: 0, net: 10 });
  assert.deepEqual(splitSale(10, 150), { commission: 10, net: 0 });
  assert.deepEqual(splitSale(33.33, 12.5), { commission: 4.17, net: 29.16 });
});

test('endereço da página, regras e totais', () => {
  assert.equal(vendorSlug('Cerâmica São José'), 'ceramica-sao-jose');
  assert.equal(vendorSlug('  --Ateliê   3D!! '), 'atelie-3d');
  assert.equal(vendorSlug(''), '');
  assert.deepEqual(normalizeMarketplaceSettings(null), { default_commission: 10, applications_open: true, show_vendor: true });
  assert.deepEqual(normalizeMarketplaceSettings({ default_commission: '120', applications_open: false, show_vendor: 0 }), { default_commission: 100, applications_open: false, show_vendor: true });
  assert.equal(normalizeMarketplaceSettings({ default_commission: -3 }).default_commission, 0);
  const t = normalizeTotals({ gross: '10.5', balance: 'x', last_sale: 5 });
  assert.deepEqual([t.gross, t.balance, t.last_sale, t.orders], [10.5, 0, null, 0]);
});

test('formulários: vendedor e pedido de cadastro', () => {
  const others = [{ id: 'a', slug: 'loja-a' }];
  assert.deepEqual(vendorDraftErrors({ name: ' ', slug: 'Loja A', commission_percent: 101 }, others, null), ['name', 'slug', 'commission']);
  assert.deepEqual(vendorDraftErrors({ name: 'B', slug: 'loja-a', commission_percent: 10 }, others, null), ['slug_taken']);
  assert.deepEqual(vendorDraftErrors({ name: 'A', slug: 'loja-a', commission_percent: 10 }, others, 'a'), []);
  assert.deepEqual(applicationErrors({ store_name: '', email: 'x@' }), ['store_name', 'email']);
  assert.deepEqual(applicationErrors({ store_name: 'Loja', email: 'a@b.co' }), []);
});

test('erros estáveis, descrição por idioma e endereço de entrega', () => {
  assert.equal(marketplaceErrorOf('ERROR: invalid_value'), 'invalid_value');
  assert.equal(marketplaceErrorOf('invalid'), 'invalid');
  assert.equal(marketplaceErrorOf('user_not_found'), 'user_not_found');
  assert.equal(marketplaceErrorOf('boom'), 'unknown');
  const d = { description_i18n: { 'pt-BR': 'Olá', en: ' ' } };
  assert.equal(vendorDescription(d, 'en'), 'Olá');
  assert.equal(vendorDescription({ description_i18n: { es: 'Hola' } }, 'en'), 'Hola');
  assert.equal(vendorDescription({ description_i18n: {} }, 'en'), '');
  assert.deepEqual(shipToLines({ name: 'Ana', street: 'Rua A', number: '10', postal_code: '01000-000', city: 'São Paulo', district: 'SP', country: 'BR' }),
    ['Ana', 'Rua A, 10', '01000-000 São Paulo SP', 'BR']);
  assert.deepEqual(shipToLines(null), []);
  // Todo código do servidor tem texto na loja.
  const site = sameKeys('src/i18n/marketplace.ts');
  for (const c of MARKETPLACE_ERRORS) assert.ok(site.has(`err_${c}`), `err_${c}`);
  assert.ok(site.has('err_unknown'));
});

test('migration: regras no banco', () => {
  assert.doesNotMatch(MIG, /\bBEGIN;|\bCOMMIT;|CONCURRENTLY/);
  for (const t of ['vendors', 'vendor_members', 'vendor_ledger', 'vendor_payouts', 'vendor_applications']) {
    assert.match(MIG, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`), t);
  }
  assert.match(MIG, /ALTER TABLE public\.products ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public\.vendors\(id\) ON DELETE SET NULL;/);
  // Vista pública só com vendedores ativos e o recurso ligado.
  assert.match(MIG, /WHERE is_active AND public\.feature_enabled\('marketplace', false\);/);
  // Livro de vendas: nasce ao pagar, comissão do momento, anulado ao cancelar ou reembolsar.
  assert.match(MIG, /CREATE TRIGGER orders_vendor_ledger AFTER UPDATE OF payment_status, status ON public\.orders/);
  assert.match(MIG, /CREATE TRIGGER order_items_vendor_ledger AFTER INSERT OR UPDATE OF quantity, price, product_id OR DELETE ON public\.order_items/);
  assert.match(MIG, /commission = round\(EXCLUDED\.gross \* public\.vendor_ledger\.commission_percent \/ 100, 2\)/);
  assert.match(MIG, /REVOKE ALL ON FUNCTION public\._vendor_ledger_sync\(uuid\) FROM PUBLIC, anon, authenticated;/);
  for (const code of ['forbidden', 'not_found', 'user_not_found', 'other_vendor', 'feature_off', 'closed', 'auth_required', 'invalid', 'already_vendor', 'already_applied', 'decided', 'untracked', 'invalid_value']) {
    assert.match(MIG, new RegExp(`RAISE EXCEPTION '${code}'`), code);
  }
  for (const f of ['admin_vendor_stats', 'admin_vendor_ledger', 'admin_vendor_members', 'admin_vendor_add_member', 'request_vendor_application', 'admin_vendor_application_decide', 'my_vendor', 'vendor_orders', 'vendor_products', 'vendor_set_stock']) {
    assert.match(MIG, new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon;`), f);
  }
});

test('recurso, rotas, menu, conta e textos', () => {
  assert.match(read('src/lib/features.ts'), /id: 'marketplace', category: 'sales', defaultOn: false, sections: \['vendors'\]/);
  assert.match(read('src/lib/features.ts'), /'\/vender': 'marketplace'/);
  assert.match(read('src/components/admin/shell/adminSections.ts'), /value: "vendors", icon: Store/);
  assert.match(read('src/pages/Admin.tsx'), /vendors: <AdminVendors \/>/);
  const app = read('src/App.tsx');
  assert.match(app, /path="\/vendedor\/:slug" element=\{<FeatureRoute feature="marketplace">/);
  assert.match(app, /path="\/vender" element=\{<FeatureRoute feature="marketplace">/);
  assert.match(read('src/pages/Dashboard.tsx'), /s\.id !== "vendedor" \|\| !!myVendor/);
  assert.match(read('src/pages/ProductDetail.tsx'), /<VendorLine vendorId=/);
  assert.match(read('src/pages/AdminProductEdit.tsx'), /vendor_id: data\.vendor_id \|\| null/);
  assert.match(read('src/lib/activityLog.ts'), /'vendors', 'vendor_payouts'/);
  for (const [f, ks] of [['src/i18n/adminFeatures.ts', ['f_marketplace', 'f_marketplace_d']], ['src/i18n/admin.ts', ['s_vendors', 'd_vendors']], ['src/i18n/adminActivity.ts', ['e_vendors', 'e_vendor_payouts']], ['src/i18n/account.ts', ['sec_vendedor', 'sec_vendedor_hint']]]) {
    for (const k of ks) assert.ok(read(f).split(`${k}:`).length >= 4, `${f} ${k} em pt-BR, en e es`);
  }
  sameKeys('src/i18n/adminMarketplace.ts');
  const admin = read('src/components/admin/AdminVendors.tsx') + read('src/components/admin/VendorField.tsx');
  assert.doesNotMatch(admin, /Dialog|confirm\(/, 'sem janelas no Admin');
});

console.log(`test-marketplace: ${n} testes ok`);
