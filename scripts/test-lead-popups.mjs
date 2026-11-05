// Teste dos pop-ups de captação (src/lib/leadPopups.ts, migration, telas e textos).
// Uso: node --experimental-strip-types scripts/test-lead-popups.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BLOCKING, MAX_ELEMENTS, NEVER_PATHS, SIZE_LIMITS, TEMPLATE_IDS, choosePopup, contentProblems, copyDesktopToMobile, defaultContent,
  defaultRules, heightForImage, leadErrors, missingLocales, newElement, normalizeContent, normalizeRules, pageAllowed, pathMatches,
  keepApart, pickText, popupBlocked, safeUrl, stackForMobile, templateContent,
} from '../src/lib/leadPopups.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };
const read = (p) => readFileSync(p, 'utf8');
const MIG = read('supabase/migrations/20261008100000_lead_popups.sql');
const keys = (s) => new Set([...s.matchAll(/^\s+([a-z0-9_]+): '/gm)].map((m) => m[1]));
const sameKeys = (file) => {
  const src = read(file);
  const block = (start, end) => src.slice(src.indexOf(start), end ? src.indexOf(end) : undefined);
  const br = keys(block('const ptBR', 'export const'));
  for (const [name, s] of [['en', block('  en: {', '  es: {')], ['es', block('  es: {')]]) {
    const k = keys(s);
    assert.deepEqual([...br].filter((x) => !k.has(x)), [], `${file} ${name} sem chaves em falta`);
  }
  assert.match(block("  'pt-PT': {", '  en: {'), /\.\.\.ptBR/);
  assert.doesNotMatch(src, /—/, 'sem travessão');
  const dup = [...src.slice(src.indexOf('const ptBR'), src.indexOf('export const')).matchAll(/^\s+([a-z0-9_]+): '/gm)].map((m) => m[1]);
  assert.equal(new Set(dup).size, dup.length, `${file}: chave repetida no pt-BR`);
  return br;
};
const vis = (path, extra = {}) => ({ path, device: 'desktop', loggedIn: false, country: 'BR', locale: 'pt-BR', seenThisSession: false, memory: undefined, now: Date.now(), ...extra });

test('endereços seguros', () => {
  assert.equal(safeUrl('https://exemplo.com/a.png'), 'https://exemplo.com/a.png');
  assert.equal(safeUrl('/produtos'), '/produtos');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('//outro.com/x'), '');
  assert.equal(safeUrl('data:text/html,x'), '');
});

test('normalizar conteúdo vindo do banco', () => {
  const c = normalizeContent({ size: { desktop: { w: 99999, h: 10 } }, form: { elements: [{ type: 'text', text: { 'pt-BR': 'Oi' } }, { type: 'nada' }] } });
  assert.equal(c.size.desktop.w, SIZE_LIMITS.desktop.maxW);
  assert.equal(c.size.desktop.h, SIZE_LIMITS.desktop.minH);
  assert.equal(c.form.elements.length, 1);
  assert.equal(c.form.elements[0].type, 'text');
  const many = normalizeContent({ form: { elements: Array.from({ length: 80 }, () => ({ type: 'text', text: { en: 'x' } })) } });
  assert.ok(many.form.elements.length <= MAX_ELEMENTS);
  const img = normalizeContent({ form: { bg: { image: 'javascript:x' }, elements: [] } });
  assert.equal(img.form.bg.image, '');
  const same = normalizeContent(defaultContent());
  assert.deepEqual(normalizeContent(same), same);
});

test('regras com padrões', () => {
  const r = normalizeRules({});
  assert.deepEqual(r, normalizeRules(defaultRules()));
  assert.ok(r.exclude.includes('/checkout*'));
  assert.equal(normalizeRules({ frequency: 'xyz' }).frequency, defaultRules().frequency);
});

test('textos por idioma', () => {
  assert.equal(pickText({ 'pt-BR': 'Olá' }, 'pt-PT'), 'Olá');
  assert.equal(pickText({ en: 'Hi', 'pt-BR': 'Olá' }, 'en'), 'Hi');
  assert.deepEqual(missingLocales({ 'pt-BR': 'a', en: 'b' }).sort(), ['es', 'pt-PT']);
});

test('conferência dos campos preenchidos', () => {
  const c = defaultContent();
  const email = newElement('field', 40, { field: 'email', required: true });
  const phone = newElement('field', 50, { field: 'phone', required: false });
  const cons = { ...newElement('consent', 60), required: true };
  c.form.elements = [email, phone, cons, newElement('button', 70)];
  assert.equal(leadErrors(c, {}, false)[email.id], 'required');
  assert.equal(leadErrors(c, { email: 'x@' }, true)[email.id], 'email');
  assert.equal(leadErrors(c, { email: 'a@b.com', phone: '123' }, true)[phone.id], 'phone');
  assert.equal(leadErrors(c, { email: 'a@b.com' }, false)[cons.id], 'consent');
  assert.deepEqual(leadErrors(c, { email: 'a@b.com', phone: '+55 (11) 98765-4321' }, true), {});
  const opt = defaultContent();
  opt.form.elements = [newElement('field', 40, { field: 'email', required: false }), newElement('button', 60)];
  assert.equal(leadErrors(opt, {}, false)._form, 'empty');
});

test('problemas que impedem ativar', () => {
  const c = defaultContent();
  c.form.elements = [newElement('button', 60)];
  const ids = contentProblems(c).map((p) => p.id);
  assert.ok(ids.includes('submit_without_fields'));
  assert.ok(ids.some((id) => BLOCKING.includes(id)));
  for (const id of TEMPLATE_IDS) {
    const t = templateContent(id);
    const blocking = contentProblems(t.content, t.coupon).filter((p) => BLOCKING.includes(p.id));
    if (id !== 'blank') assert.deepEqual(blocking, [], `modelo ${id} pronto para ativar`);
  }
});

test('modelo Modal VIP aproveita os textos antigos', () => {
  const t = templateContent('vip', { title: 'Clube VIP', description: 'Ganhe 10%', button_text: 'Quero', discount_code: 'vip10', terms_text: 'Aceito' });
  const json = JSON.stringify(t.content);
  assert.ok(json.includes('Clube VIP'));
  assert.ok(json.includes('Ganhe 10%'));
  assert.equal(t.coupon, 'VIP10');
  const img = templateContent('image');
  assert.ok(img.content.form.elements.some((e) => e.type === 'field'));
  assert.ok(!img.content.form.elements.some((e) => e.type === 'text'), 'modelo só imagem sem texto solto');
});

test('páginas', () => {
  assert.ok(pathMatches('/produtos/', '/produtos'));
  assert.ok(pathMatches('/produto/abc?x=1', '/produto/*'));
  assert.ok(!pathMatches('/produtosx', '/produtos'));
  const r = defaultRules();
  assert.ok(pageAllowed(r, '/'));
  assert.ok(!pageAllowed(r, '/checkout'));
  for (const p of NEVER_PATHS) assert.ok(!pageAllowed({ ...r, exclude: [] }, p.replace('*', '/x')));
  assert.ok(!pageAllowed({ ...r, pages: 'home' }, '/produtos'));
  assert.ok(pageAllowed({ ...r, pages: 'catalog' }, '/categoria/vasos'));
  assert.ok(pageAllowed({ ...r, pages: 'custom', include: ['/blog*'] }, '/blog/post'));
});

test('quem vê e quantas vezes', () => {
  const r = { ...defaultRules(), frequency: 'days', days: 3 };
  assert.equal(popupBlocked(r, vis('/')), null);
  assert.equal(popupBlocked({ ...r, devices: { desktop: false, mobile: true } }, vis('/')), 'device');
  assert.equal(popupBlocked({ ...r, audience: 'guests' }, vis('/', { loggedIn: true })), 'audience');
  assert.equal(popupBlocked({ ...r, countries: ['PT'] }, vis('/')), 'country');
  assert.equal(popupBlocked({ ...r, locales: ['en'] }, vis('/')), 'locale');
  assert.equal(popupBlocked({ ...r, hideAfterSubmit: true }, vis('/', { memory: { submitted: 1 } })), 'submitted');
  const now = Date.now();
  assert.equal(popupBlocked(r, vis('/', { memory: { closed: now - 86_400_000 }, now })), 'frequency');
  assert.equal(popupBlocked(r, vis('/', { memory: { closed: now - 4 * 86_400_000 }, now })), null);
  assert.equal(popupBlocked({ ...r, frequency: 'once' }, vis('/', { memory: { seen: 1 } })), 'frequency');
  assert.equal(popupBlocked({ ...r, frequency: 'session' }, vis('/', { seenThisSession: true })), 'frequency');
  const a = { id: 'a', priority: 2, rules: r };
  const b = { id: 'b', priority: 1, rules: { ...r, pages: 'home' } };
  assert.equal(choosePopup([a, b], () => vis('/'))?.id, 'b');
  assert.equal(choosePopup([a, b], () => vis('/produtos'))?.id, 'a');
});

test('celular: empilhar e copiar', () => {
  const t = templateContent('vip').content;
  const stacked = stackForMobile(t, 'form');
  let last = -1;
  for (const el of stacked.form.elements.filter((e) => !e.hideOn?.mobile)) {
    const m = el.mobile ?? el.desktop;
    assert.ok(m.y >= last, 'ordem de cima para baixo');
    assert.ok(m.x >= 0 && m.x + m.w <= 100.01, 'dentro da largura');
    last = m.y;
  }
  const copied = copyDesktopToMobile(t, 'form');
  for (const el of copied.form.elements) assert.deepEqual(el.mobile, el.desktop);
  assert.equal(heightForImage(500, 1000, 500, 'desktop'), 250);
});

test('ajustar à imagem não deixa peças por cima umas das outras', () => {
  const t = templateContent('image').content;
  const small = { ...t, size: { ...t.size, mobile: { w: 340, h: 300 } } };
  const out = keepApart(small, 'form', 'mobile');
  const rows = out.form.elements.filter((e) => !e.hidden.mobile && e.type !== 'shape')
    .map((e) => ({ top: (e.mobile.y / 100) * 300, h: e.mobile.h != null ? (e.mobile.h / 100) * 300 : (e.type === 'field' ? e.height : e.type === 'button' ? e.height : 0) }))
    .sort((a, b) => a.top - b.top);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].top >= rows[i - 1].top + rows[i - 1].h, 'sem sobreposição');
  assert.ok(rows.every((r) => r.top + r.h <= 300), 'dentro da caixa');
});

test('migration: tabelas protegidas e funções do site', () => {
  for (const f of ['site_popups', 'popup_seen', 'submit_popup_lead', 'admin_popup_stats', 'admin_popup_reset_views', '_popup_visitor_hash']) {
    assert.match(MIG, new RegExp(`function public\\.${f}\\(`, "i"), f);
  }
  assert.match(MIG, /enable row level security/i);
  assert.match(MIG, /feature_enabled\('lead_popups'/);
  assert.match(MIG, /rate_limited/);
  assert.doesNotMatch(MIG, /^\s*(BEGIN|COMMIT)\s*;/im);
  assert.doesNotMatch(MIG, /CONCURRENTLY/i);
  assert.doesNotMatch(MIG, /grant select on (table )?public\.lead_popups to anon/i, 'visitante não lê a tabela');
});

test('ligações: recurso, menu, privacidade e registo', () => {
  assert.match(read('src/lib/features.ts'), /id: 'lead_popups'.*sections: \['popups'\]/);
  assert.match(read('src/components/admin/shell/adminSections.ts'), /value: "popups"/);
  assert.match(read('src/pages/Admin.tsx'), /popups: <AdminPopups \/>/);
  assert.match(read('src/App.tsx'), /<SitePopups \/>/);
  assert.match(read('src/lib/privacy.ts'), /'loja3d-popups'/);
  assert.match(read('src/lib/consent.ts'), /"loja3d-popups"/);
  assert.match(read('src/lib/activityLog.ts'), /'lead_popups', 'popup_leads'/);
  for (const [file, k] of [['src/i18n/admin.ts', 's_popups'], ['src/i18n/adminFeatures.ts', 'f_lead_popups_d'], ['src/i18n/adminActivity.ts', 'e_popup_leads'], ['src/i18n/legal.ts', 'p_popups']]) {
    assert.equal((read(file).match(new RegExp(`\\b${k}:`, 'g')) ?? []).length >= 3, true, `${file} ${k} nos idiomas`);
  }
});

test('textos nos 4 idiomas, sem travessão', () => {
  const admin = sameKeys('src/i18n/adminPopups.ts');
  const site = sameKeys('src/i18n/popups.ts');
  assert.ok(admin.size > 300 && site.size > 5);
  for (const f of ['src/components/popups/LeadPopups.tsx', 'src/components/popups/PopupCanvas.tsx', 'src/components/admin/AdminPopups.tsx',
    'src/components/admin/popups/PopupBuilder.tsx', 'src/components/admin/popups/PopupInspector.tsx', 'src/components/admin/popups/PopupDisplay.tsx',
    'src/components/admin/popups/PopupEditor.tsx', 'src/components/admin/popups/PopupLeadsList.tsx', 'src/lib/leadPopups.ts']) {
    const s = read(f);
    assert.doesNotMatch(s, /—/, `${f} sem travessão`);
    assert.doesNotMatch(s, /<Dialog|AlertDialog|window\.confirm\(/, `${f} sem janelas`);
    for (const m of s.matchAll(/\bt\("([a-z0-9_]+)"/g)) {
      if (f.includes('/admin/')) assert.ok(admin.has(m[1]), `${f}: chave ${m[1]} sem texto`);
    }
  }
});

console.log(`\n${n} testes ok`);
