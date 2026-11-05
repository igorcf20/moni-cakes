// Teste de Carrinho e checkout (src/lib/checkoutPage.ts): padrão, lixo, modelos, etapas recolhidas e próxima etapa;
// textos da loja e do Admin nos 4 idiomas, sem travessões.
// Uso: node --experimental-strip-types scripts/test-checkout-page.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CLASSIC_CHECKOUT_PAGE, DEFAULT_CHECKOUT_PAGE, nextStepTarget, normalizeCheckoutPage, sameCheckoutPage, stepFolded,
} from '../src/lib/checkoutPage.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

test('sem valor guardado = padrão', () => {
  assert.deepEqual(normalizeCheckoutPage(undefined), DEFAULT_CHECKOUT_PAGE);
  assert.deepEqual(normalizeCheckoutPage(null), DEFAULT_CHECKOUT_PAGE);
  assert.deepEqual(normalizeCheckoutPage([]), DEFAULT_CHECKOUT_PAGE);
});

test('lixo volta ao padrão campo a campo', () => {
  const r = normalizeCheckoutPage({ steps: 'x', mobile_bar: 'sim', intro: 'full', coupon: 3, trust: false, cart_lines: 'roomy', extra: 1 });
  assert.equal(r.steps, 'compact');
  assert.equal(r.mobile_bar, true);
  assert.equal(r.intro, 'full');
  assert.equal(r.coupon, 'link');
  assert.equal(r.trust, false);
  assert.equal(r.cart_lines, 'roomy');
  assert.equal('extra' in r, false);
});

test('modelos diferentes e estáveis', () => {
  assert.equal(sameCheckoutPage(DEFAULT_CHECKOUT_PAGE, CLASSIC_CHECKOUT_PAGE), false);
  assert.equal(sameCheckoutPage(CLASSIC_CHECKOUT_PAGE, normalizeCheckoutPage(CLASSIC_CHECKOUT_PAGE)), true);
  assert.equal(CLASSIC_CHECKOUT_PAGE.steps, 'open');
  assert.equal(CLASSIC_CHECKOUT_PAGE.mobile_bar, false);
});

test('etapa recolhe só no modo compacto, completa e marcada', () => {
  const done = new Set(['contact', 'payment']);
  assert.equal(stepFolded({ steps: 'compact', id: 'contact', complete: true, done }), true);
  assert.equal(stepFolded({ steps: 'open', id: 'contact', complete: true, done }), false);
  // o que deixa de estar completo abre sozinho
  assert.equal(stepFolded({ steps: 'compact', id: 'contact', complete: false, done }), false);
  assert.equal(stepFolded({ steps: 'compact', id: 'address', complete: true, done }), false);
  // pagamento e revisão nunca recolhem
  assert.equal(stepFolded({ steps: 'compact', id: 'payment', complete: true, done }), false);
  assert.equal(stepFolded({ steps: 'compact', id: 'review', complete: true, done: new Set(['review']) }), false);
});

test('barra do celular leva à primeira pendência', () => {
  assert.equal(nextStepTarget(['billing', 'review']), 'billing');
  assert.equal(nextStepTarget([]), 'review');
});

const LOCALES = ['pt-BR', 'pt-PT', 'en', 'es'];
for (const file of ['checkoutPage', 'adminCheckoutPage']) {
  test(`textos ${file} nos 4 idiomas, sem travessões`, () => {
    const src = readFileSync(new URL(`../src/i18n/${file}.ts`, import.meta.url), 'utf8');
    const keys = [...src.slice(src.indexOf('const ptBR'), src.indexOf('};')).matchAll(/^  (\w+):/gm)].map((m) => m[1]);
    assert.ok(keys.length > 5);
    for (const loc of LOCALES.slice(1)) {
      const start = src.indexOf(loc === 'pt-PT' ? "'pt-PT': {" : `  ${loc}: {`);
      assert.ok(start > 0, `${file} sem ${loc}`);
      const block = src.slice(start, src.indexOf('\n  },', start));
      for (const k of keys) assert.ok(new RegExp(`\\n    ${k}:`).test(block), `${file} ${loc} sem ${k}`);
    }
    assert.equal(/—/.test(src), false);
  });
}

test('seção no Admin e textos do menu', () => {
  const sections = readFileSync(new URL('../src/components/admin/shell/adminSections.ts', import.meta.url), 'utf8');
  assert.ok(sections.includes('value: "checkout-page"'));
  const admin = readFileSync(new URL('../src/i18n/admin.ts', import.meta.url), 'utf8');
  assert.equal((admin.match(/s_checkout_page:/g) ?? []).length, 4);
  assert.equal((admin.match(/d_checkout_page:/g) ?? []).length, 4);
});

console.log(`\n${n} testes ok`);
