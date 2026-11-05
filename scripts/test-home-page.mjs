// Teste da página inicial editável (src/lib/homePage.ts): leitura do valor gravado no Admin.
//   node --experimental-strip-types scripts/test-home-page.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_SPOTLIGHT, HOME_SECTIONS, HOME_TEXT_KEYS, homeText, parseHomePage } from '../src/lib/homePage.ts';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`ok ${name}`); };

ok('valor vazio ou estranho = padrão', () => {
  for (const v of [null, undefined, 'x', 3, [], {}]) {
    assert.deepEqual(parseHomePage(v), { hidden: [], texts: {}, images: {}, spotlight: DEFAULT_SPOTLIGHT });
  }
});

ok('ignora seções, chaves e tipos desconhecidos', () => {
  const p = parseHomePage({
    hidden: ['how', 'nao-existe', 'how', 5],
    texts: { 'pt-BR': { hero_lead: '  Olá  ', addError: 'não editável', cats_title: '', best_title: 7 }, en: 'x' },
    images: { hero: '/a.webp', pla: '', outra: '/b.webp' },
    spotlight: 'Casa e jardim',
  });
  assert.deepEqual(p.hidden, ['how']);
  assert.deepEqual(p.texts, { 'pt-BR': { hero_lead: 'Olá' } });
  assert.deepEqual(p.images, { hero: '/a.webp' });
  assert.equal(p.spotlight, DEFAULT_SPOTLIGHT);
});

ok('texto do Admin por idioma, senão null', () => {
  const p = parseHomePage({ texts: { en: { hero_cta: 'Shop' } }, spotlight: 'casa' });
  assert.equal(homeText(p, 'en', 'hero_cta'), 'Shop');
  assert.equal(homeText(p, 'pt-BR', 'hero_cta'), null);
  assert.equal(p.spotlight, 'casa');
});

ok('chaves editáveis existem no i18n da página inicial', () => {
  const src = readFileSync(new URL('../src/i18n/layout.ts', import.meta.url), 'utf8');
  for (const k of HOME_TEXT_KEYS) assert.ok(new RegExp(`\\b${k}:`).test(src), `falta ${k} em layout.ts`);
  assert.equal(new Set(HOME_SECTIONS.map((s) => s.id)).size, HOME_SECTIONS.length);
});

ok('cada seção tem nome e explicação no Admin', () => {
  const src = readFileSync(new URL('../src/i18n/adminHome.ts', import.meta.url), 'utf8');
  for (const s of HOME_SECTIONS) {
    assert.ok(src.includes(`sec_${s.id}:`), `falta sec_${s.id}`);
    assert.ok(src.includes(`sec_${s.id}_hint:`), `falta sec_${s.id}_hint`);
  }
});

console.log(`${n} testes ok`);
