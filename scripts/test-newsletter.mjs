// Teste das campanhas de newsletter (src/lib/newsletter.ts, migration, telas e textos).
// Uso: node --experimental-strip-types scripts/test-newsletter.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EMPTY_CAMPAIGN, NEWSLETTER_ERRORS, SEGMENTS, UNSUBSCRIBE_PATH, absoluteUrl, campaignDraftErrors, campaignState, duplicateCampaign,
  htmlText, newsletterErrorOf, normalizeNewsletterSettings, renderNewsletterEmail,
} from '../src/lib/newsletter.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };
const read = (p) => readFileSync(p, 'utf8');
const MIG = read('supabase/migrations/20261007180000_newsletter_campaigns.sql');
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

test('estado mostrado no Admin', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  assert.equal(campaignState({ status: 'draft', send_at: null }, now), 'draft');
  assert.equal(campaignState({ status: 'queued', send_at: null }, now), 'queued');
  assert.equal(campaignState({ status: 'queued', send_at: '2026-10-11T09:00:00Z' }, now), 'scheduled');
  assert.equal(campaignState({ status: 'queued', send_at: '2026-10-10T11:00:00Z' }, now), 'queued');
  assert.equal(campaignState({ status: 'sent', send_at: '2026-12-01T00:00:00Z' }, now), 'sent');
});

test('o que falta numa campanha', () => {
  const d = (x) => ({ ...EMPTY_CAMPAIGN, ...x });
  assert.deepEqual(campaignDraftErrors(d({ name: 'Out' }), false), []);
  assert.deepEqual(campaignDraftErrors(d({ name: ' ' }), false), ['name']);
  assert.deepEqual(campaignDraftErrors(d({ name: 'Out', body: '<p> </p>' }), true), ['subject', 'body']);
  assert.deepEqual(campaignDraftErrors(d({ name: 'Out', subject: 'Oi', body: '<p>Novidades</p>' }), true), []);
  assert.equal(htmlText('<p>Olá&nbsp;<b>você</b></p><script>x()</script>'), 'Olá você');
  const copy = duplicateCampaign(d({ name: 'Out', product_ids: ['a'] }), '(cópia)');
  assert.equal(copy.name, 'Out (cópia)');
  assert.notEqual(copy.product_ids, EMPTY_CAMPAIGN.product_ids);
});

test('regras da loja', () => {
  assert.deepEqual(normalizeNewsletterSettings(null), { from_name: '', reply_to: '', footer_text: '' });
  assert.equal(normalizeNewsletterSettings({ reply_to: 'nao-e-email' }).reply_to, '');
  assert.equal(normalizeNewsletterSettings({ reply_to: ' oi@loja.com ' }).reply_to, 'oi@loja.com');
  assert.equal(normalizeNewsletterSettings({ footer_text: 'x'.repeat(900) }).footer_text.length, 600);
  assert.equal(absoluteUrl('https://loja.test/', '/images/a.webp'), 'https://loja.test/images/a.webp');
  assert.equal(absoluteUrl('https://loja.test', 'https://cdn.test/a.png'), 'https://cdn.test/a.png');
  assert.equal(absoluteUrl('https://loja.test', ''), '');
});

test('HTML do e-mail escapa o que vem de fora e leva o link para cancelar', () => {
  const html = renderNewsletterEmail({
    subject: 'Novidades <b>', preheader: '"pré"', body: '<p>Texto</p>',
    products: Array.from({ length: 8 }, (_, k) => ({ name: `P${k} <script>`, price: 'R$ 10,00', oldPrice: k === 0 ? 'R$ 12,00' : null, image: null, url: `https://loja.test/produto/${k}` })),
    brand: { name: 'Loja "X"', logo: '', primary: '#FF5A0A', text: '#171717', muted: '#737373', background: '#FBF8F3', surface: '#FFFFFF', border: '#EDE9E3' },
    footerText: 'Rua A\nCidade', siteUrl: 'https://loja.test', unsubscribeUrl: `https://loja.test${UNSUBSCRIBE_PATH}?t=abc`,
    labels: { viewProduct: 'Ver', products: 'Escolhidos', unsubscribe: 'Cancelar inscrição', why: 'Porque sim', visit: 'Visitar' }, lang: 'pt-BR',
  });
  assert.match(html, /<title>Novidades &lt;b&gt;<\/title>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Loja &quot;X&quot;/);
  assert.match(html, /href="https:\/\/loja\.test\/newsletter\/cancelar\?t=abc"/);
  assert.match(html, /Rua A<br>Cidade/);
  assert.equal((html.match(/\/produto\//g) ?? []).length, 6, 'até 6 produtos');
  assert.match(html, /<s [^>]*>R\$ 12,00<\/s>/);
});

test('erros estáveis e textos', () => {
  assert.equal(newsletterErrorOf('ERROR: no_recipients'), 'no_recipients');
  assert.equal(newsletterErrorOf('ERROR: not_queued'), 'not_queued');
  assert.equal(newsletterErrorOf('boom'), 'unknown');
  const admin = sameKeys('src/i18n/adminNewsletter.ts');
  for (const code of [...NEWSLETTER_ERRORS, 'unknown']) assert.ok(admin.has(`err_${code}`), code);
  for (const s of ['draft', 'scheduled', 'queued', 'sending', 'sent', 'cancelled']) assert.ok(admin.has(`state_${s}`), s);
  for (const s of SEGMENTS) assert.ok(admin.has(`seg_${s}`) && admin.has(`seg_${s}_d`), s);
  const site = sameKeys('src/i18n/newsletter.ts');
  for (const k of ['mail_products', 'mail_view', 'mail_visit', 'mail_why', 'mail_unsubscribe', 'done', 'invalid']) assert.ok(site.has(k), k);
});

test('migration: regras no banco', () => {
  assert.doesNotMatch(MIG, /\bBEGIN;|\bCOMMIT;|CONCURRENTLY/);
  for (const t of ['newsletter_campaigns', 'newsletter_deliveries']) assert.match(MIG, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`), t);
  assert.match(MIG, /REVOKE ALL ON public\.newsletter_campaigns, public\.newsletter_deliveries FROM anon, authenticated;/);
  assert.match(MIG, /GRANT SELECT ON public\.newsletter_deliveries TO authenticated;/);
  for (const code of NEWSLETTER_ERRORS) assert.match(MIG, new RegExp(`RAISE EXCEPTION '${code}'`), code);
  // Quem não é admin só cria inscrições ativas, com chave nova; a chave nunca muda depois.
  assert.match(MIG, /IF NOT is_admin THEN\s+NEW\.status := 'subscribed';\s+NEW\.unsubscribe_token := gen_random_uuid\(\);/);
  assert.match(MIG, /NEW\.unsubscribe_token := OLD\.unsubscribe_token;/);
  // Fora do rascunho o conteúdo fecha; a fila só muda pelas RPCs.
  assert.match(MIG, /IF TG_OP = 'UPDATE' AND OLD\.status <> 'draft' THEN RAISE EXCEPTION 'locked'/);
  assert.match(MIG, /IF NOT public\.feature_enabled\('newsletter_campaigns', false\) THEN RAISE EXCEPTION 'feature_off'/);
  assert.match(MIG, /REVOKE ALL ON FUNCTION public\._newsletter_audience\(text, text\) FROM PUBLIC, anon, authenticated;/);
  for (const f of ['newsletter_audience_count', 'newsletter_queue', 'newsletter_cancel', 'admin_newsletter_stats']) {
    assert.match(MIG, new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon;`), f);
  }
  // Cancelar a inscrição funciona sem conta e mesmo com o recurso desligado.
  assert.match(MIG, /GRANT EXECUTE ON FUNCTION public\.newsletter_unsubscribe\(uuid, boolean\) TO anon, authenticated;/);
  assert.doesNotMatch(MIG.slice(MIG.indexOf('FUNCTION public.newsletter_unsubscribe')), /feature_enabled/);
});

test('recurso, rotas, menu, rodapé e textos', () => {
  assert.match(read('src/lib/features.ts'), /id: 'newsletter_campaigns', category: 'marketing', defaultOn: false, sections: \['newsletter'\]/);
  assert.match(read('src/components/admin/shell/adminSections.ts'), /value: "newsletter", icon: MailOpen/);
  assert.match(read('src/pages/Admin.tsx'), /newsletter: <AdminNewsletter \/>/);
  assert.match(read('src/App.tsx'), /path="\/newsletter\/cancelar" element=\{<NewsletterUnsubscribe \/>\}/);
  assert.match(read('src/components/Footer.tsx'), /insert\(\{ email: value, locale \}\)/);
  assert.match(read('src/lib/activityLog.ts'), /'newsletter_campaigns'/);
  assert.match(read('src/lib/activityLog.ts'), /'newsletter_subscriptions'/);
  assert.doesNotMatch(read('src/hooks/useNewsletter.ts'), /from\("newsletter_subscriptions"\)\.select\("\*/, 'chave de cancelamento fora da lista');
  for (const [f, ks] of [['src/i18n/adminFeatures.ts', ['f_newsletter_campaigns', 'f_newsletter_campaigns_d']], ['src/i18n/admin.ts', ['s_newsletter', 'd_newsletter']], ['src/i18n/adminActivity.ts', ['e_newsletter_campaigns', 'e_newsletter_subscriptions']]]) {
    for (const k of ks) assert.ok(read(f).split(`${k}:`).length >= 4, `${f} ${k} em pt-BR, en e es`);
  }
  const admin = read('src/components/admin/AdminNewsletter.tsx');
  assert.doesNotMatch(admin, /Dialog|confirm\(/, 'sem janelas no Admin');
  assert.match(admin, /sandbox=""/, 'prévia sem scripts');
});

console.log(`test-newsletter: ${n} testes ok`);
