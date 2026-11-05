// Menu Todas as categorias (src/lib/megaMenu.ts): regras padrão, limpeza do que vem do banco, escolha das categorias
// em destaque (automático, escolher, sem destaque), texto do banner e ligações nas telas.
// node --experimental-strip-types scripts/test-mega-menu.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_MEGA_MENU, MEGA_MENU_MAX_FEATURED, bannerText, normalizeMegaMenu, pickFeatured } from '../src/lib/megaMenu.ts';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok', name); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const menu = ['decoracao', 'organizacao', 'suportes', 'geek', 'casa'].map((slug) => ({ slug, subs: [{ label: `${slug} 1` }, { label: `${slug} 2` }], db: null }));

test('padrão: automático com 3, texto, Novidades, atalhos e celular', () => {
  assert.deepEqual(normalizeMegaMenu(undefined), DEFAULT_MEGA_MENU);
  assert.equal(DEFAULT_MEGA_MENU.featuredMode, 'auto');
  assert.equal(DEFAULT_MEGA_MENU.count, 3);
});

test('limpeza: modo, quantidade de 1 a 4, slugs sem repetidos', () => {
  const s = normalizeMegaMenu({ featuredMode: 'x', count: 9, featured: ['a', 'a', ' b ', 3, '', 'c', 'd', 'e'], sideCard: 'off', quickLinks: 'no' });
  assert.equal(s.featuredMode, 'auto');
  assert.equal(s.count, 4);
  assert.deepEqual(s.featured, ['a', 'b', 'c', 'd']);
  assert.equal(s.featured.length, MEGA_MENU_MAX_FEATURED);
  assert.equal(s.sideCard, 'off');
  assert.equal(s.quickLinks, true);
  assert.equal(normalizeMegaMenu({ count: 0 }).count, 1);
});

test('escolha das categorias em destaque', () => {
  assert.deepEqual(pickFeatured(menu, DEFAULT_MEGA_MENU).map((c) => c.slug), ['decoracao', 'organizacao', 'suportes']);
  assert.deepEqual(pickFeatured(menu, { ...DEFAULT_MEGA_MENU, count: 1 }).map((c) => c.slug), ['decoracao']);
  assert.deepEqual(pickFeatured(menu, { ...DEFAULT_MEGA_MENU, featuredMode: 'manual', featured: ['casa', 'sumiu', 'geek'] }).map((c) => c.slug), ['casa', 'geek']);
  assert.deepEqual(pickFeatured(menu, { ...DEFAULT_MEGA_MENU, featuredMode: 'off' }), []);
});

test('texto do banner: descrição sem HTML ou subcategorias', () => {
  assert.equal(bannerText(menu[0]), 'decoracao 1, decoracao 2');
  assert.equal(bannerText({ db: { description: '<p>Peças <b>bonitas</b></p>' }, subs: [] }), 'Peças bonitas');
  assert.ok(bannerText({ db: { description: 'x'.repeat(200) }, subs: [] }).length <= 90);
});

test('telas: mega menu, menu do celular e Admin seguem as regras', () => {
  const mega = read('src/components/header/MegaMenu.tsx');
  assert.match(mega, /pickFeatured\(menu, settings\)/);
  assert.match(mega, /settings\.sideCard === 'news'/);
  assert.match(mega, /settings\.quickLinks/);
  assert.match(read('src/components/header/MobileMenu.tsx'), /mega\.mobile \? pickFeatured/);
  assert.match(read('src/components/admin/AdminCategories.tsx'), /page\.view === "menu"/);
  const texts = read('src/i18n/adminOffers.ts');
  assert.equal((texts.match(/\bmm_title: '/g) || []).length, 3);
  assert.ok(!texts.includes('—'));
});

console.log(`${n} testes ok`);
