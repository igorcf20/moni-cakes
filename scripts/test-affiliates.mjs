// Teste do programa de afiliados (src/lib/affiliates.ts, migration, telas e textos).
// Uso: node --experimental-strip-types scripts/test-affiliates.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AFFILIATE_ERRORS, affiliateApplicationErrors, affiliateCode, affiliateCommission, affiliateDraftErrors, affiliateErrorOf,
  affiliateLink, cleanAffiliateCode, conversionRate, normalizeAffiliateSettings, normalizeAffiliateTotals,
} from '../src/lib/affiliates.ts';
import { offeredCategories, storageFor } from '../src/lib/privacy.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };
const read = (p) => readFileSync(p, 'utf8');
const MIG = read('supabase/migrations/20261007140000_affiliates.sql');
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

test('comissão: produtos menos cupom, sem frete (igual ao servidor)', () => {
  assert.deepEqual(affiliateCommission(100, 10, 5), { base: 90, commission: 4.5 });
  assert.deepEqual(affiliateCommission(49.9, 0, 7.5), { base: 49.9, commission: 3.74 });
  assert.deepEqual(affiliateCommission(20, 30, 10), { base: 0, commission: 0 });
  assert.deepEqual(affiliateCommission(10, 0, 150), { base: 10, commission: 10 });
  assert.equal(conversionRate({ visits: 0, orders: 3 }), 0);
  assert.equal(conversionRate({ visits: 300, orders: 7 }), 2.3);
});

test('código do link e link para qualquer página', () => {
  assert.equal(affiliateCode('Blog da Ána!'), 'blog-da-ana');
  assert.equal(affiliateCode('  --Casa   Bonita 3D '), 'casa-bonita-3d');
  assert.equal(cleanAffiliateCode(' BLOG-ANA '), 'blog-ana');
  assert.equal(cleanAffiliateCode('ab'), null);
  assert.equal(cleanAffiliateCode('a b c'), null);
  assert.equal(cleanAffiliateCode('x'.repeat(41)), null);
  assert.equal(affiliateLink('https://loja.test/', 'ana'), 'https://loja.test/?ref=ana');
  assert.equal(affiliateLink('https://loja.test', 'ana', '/produtos?q=vaso&ref=velho#topo'), 'https://loja.test/produtos?q=vaso&ref=ana#topo');
  assert.equal(affiliateLink('https://loja.test', 'ana', 'https://loja.test/produto/x'), 'https://loja.test/produto/x?ref=ana');
});

test('regras, totais e formulários', () => {
  assert.deepEqual(normalizeAffiliateSettings(null), { default_commission: 5, cookie_days: 30, applications_open: true, min_payout: 0 });
  assert.deepEqual(normalizeAffiliateSettings({ default_commission: '120', cookie_days: 900, applications_open: false, min_payout: -5 }),
    { default_commission: 100, cookie_days: 365, applications_open: false, min_payout: 0 });
  assert.equal(normalizeAffiliateSettings({ cookie_days: 0 }).cookie_days, 1);
  const t = normalizeAffiliateTotals({ sales: '10.5', balance: 'x', last_order: 5 });
  assert.deepEqual([t.sales, t.balance, t.last_order, t.visits], [10.5, 0, null, 0]);
  const others = [{ id: 'a', code: 'blog-a' }];
  assert.deepEqual(affiliateDraftErrors({ name: ' ', code: 'Blog A', commission_percent: 101 }, others, null), ['name', 'code', 'commission']);
  assert.deepEqual(affiliateDraftErrors({ name: 'B', code: 'blog-a', commission_percent: 5 }, others, null), ['code_taken']);
  assert.deepEqual(affiliateDraftErrors({ name: 'A', code: 'blog-a', commission_percent: 5 }, others, 'a'), []);
  assert.deepEqual(affiliateApplicationErrors({ name: '', email: 'x@' }), ['name', 'email']);
  assert.deepEqual(affiliateApplicationErrors({ name: 'Ana', email: 'a@b.co' }), []);
});

test('erros estáveis e textos da loja', () => {
  assert.equal(affiliateErrorOf('ERROR: already_affiliate'), 'already_affiliate');
  assert.equal(affiliateErrorOf('other_affiliate'), 'other_affiliate');
  assert.equal(affiliateErrorOf('boom'), 'unknown');
  const site = sameKeys('src/i18n/affiliates.ts');
  for (const c of AFFILIATE_ERRORS) assert.ok(site.has(`err_${c}`), `err_${c}`);
  assert.ok(site.has('err_unknown'));
  sameKeys('src/i18n/adminAffiliates.ts');
});

test('privacidade: código no aparelho só com Marketing', () => {
  assert.ok(!offeredCategories({}).includes('marketing'));
  assert.ok(offeredCategories({ affiliates: true }).includes('marketing'));
  assert.deepEqual(storageFor('marketing', {}).map((i) => i.name), []);
  assert.deepEqual(storageFor('marketing', { affiliates: true }).map((i) => i.name), ['loja3d-affiliate']);
  const track = read('src/lib/affiliateTracking.ts');
  assert.match(track, /hasConsent\('marketing'\)/);
  assert.match(track, /onConsentChange/);
});

test('migration: regras no banco', () => {
  assert.doesNotMatch(MIG, /\bBEGIN;|\bCOMMIT;|CONCURRENTLY/);
  for (const t of ['affiliates', 'affiliate_visits', 'affiliate_ledger', 'affiliate_payouts']) {
    assert.match(MIG, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`), t);
  }
  assert.match(MIG, /ALTER TABLE public\.orders ADD COLUMN IF NOT EXISTS affiliate_id uuid REFERENCES public\.affiliates\(id\) ON DELETE SET NULL;/);
  // O cliente não muda o afiliado do pedido; o livro nasce ao pagar e anula ao cancelar.
  assert.match(MIG, /NEW\.affiliate_id\s+:= OLD\.affiliate_id/);
  assert.match(MIG, /CREATE TRIGGER orders_affiliate_ledger AFTER UPDATE OF payment_status, status, affiliate_id, discount_amount ON public\.orders/);
  assert.match(MIG, /REVOKE ALL ON FUNCTION public\._affiliate_ledger_sync\(uuid\) FROM PUBLIC, anon, authenticated;/);
  // Só o servidor liga o pedido ao afiliado, e nunca à própria conta.
  assert.match(MIG, /REVOKE ALL ON FUNCTION public\.affiliate_for_order\(text, uuid\) FROM PUBLIC, anon, authenticated;/);
  assert.match(MIG, /user_id IS NULL OR _buyer IS NULL OR user_id <> _buyer/);
  for (const code of AFFILIATE_ERRORS) assert.match(MIG, new RegExp(`RAISE EXCEPTION '${code}'`), code);
  for (const f of ['admin_affiliate_stats', 'admin_affiliate_ledger', 'admin_affiliate_link_user', 'admin_affiliate_accounts', 'request_affiliate', 'admin_affiliate_decide', 'my_affiliate', 'my_affiliate_payout_info', 'my_affiliate_orders']) {
    assert.match(MIG, new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon;`), f);
  }
  const co = read('supabase/functions/create-order/index.ts');
  assert.match(co, /affiliate_for_order/);
  assert.match(read('src/pages/Checkout.tsx'), /affiliate_code: currentAffiliateCode\(\)/);
});

test('recurso, rotas, menu, conta e textos', () => {
  assert.match(read('src/lib/features.ts'), /id: 'affiliates', category: 'marketing', defaultOn: false, sections: \['affiliates'\]/);
  assert.match(read('src/lib/features.ts'), /'\/afiliados': 'affiliates'/);
  assert.match(read('src/components/admin/shell/adminSections.ts'), /value: "affiliates", icon: Handshake/);
  assert.match(read('src/pages/Admin.tsx'), /affiliates: <AdminAffiliates \/>/);
  const app = read('src/App.tsx');
  assert.match(app, /path="\/afiliados" element=\{<FeatureRoute feature="affiliates">/);
  assert.match(app, /<AffiliateCapture \/>/);
  assert.match(read('src/lib/activityLog.ts'), /'affiliates', 'affiliate_payouts'/);
  for (const [f, ks] of [['src/i18n/adminFeatures.ts', ['f_affiliates', 'f_affiliates_d']], ['src/i18n/admin.ts', ['s_affiliates', 'd_affiliates']], ['src/i18n/adminActivity.ts', ['e_affiliates', 'e_affiliate_payouts']], ['src/i18n/account.ts', ['sec_afiliado', 'sec_afiliado_hint']], ['src/i18n/legal.ts', ['p_affiliate', 'd_affiliate']]]) {
    for (const k of ks) assert.ok(read(f).split(`${k}:`).length >= 4, `${f} ${k} em pt-BR, en e es`);
  }
  assert.doesNotMatch(read('src/components/admin/AdminAffiliates.tsx'), /Dialog|confirm\(/, 'sem janelas no Admin');
});

console.log(`test-affiliates: ${n} testes ok`);
