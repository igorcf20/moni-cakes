// Teste da Exibição de preços (src/lib/priceDisplay.ts): preço no Pix igual ao desconto que o servidor cobra
// (paymentDiscount de _shared/payments/methods.ts), parcelas sem e com juros, parcela mínima, destaque por lugar
// com recurso quando o destaque não existe, países e limites do meio; textos nos 4 idiomas e recurso no catálogo.
// Uso: node --experimental-strip-types scripts/test-price-display.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_PRICE_DISPLAY, PRICE_PLACES, PRICE_PRESETS, cashDiscountFor, cashPrice, headlineInstallment, installmentPlan, normalizePriceDisplay, priceView } from '../src/lib/priceDisplay.ts';
import { methodBlock, paymentDiscount, round2 } from '../supabase/functions/_shared/payments/methods.ts';
import { FEATURES } from '../src/lib/features.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

test('preço no Pix = valor menos o desconto que o pedido cobra', () => {
  for (const amount of [0.99, 1, 9.9, 19.99, 49.5, 99.99, 123.45, 1999.9, 3333.33]) {
    for (const pct of [1, 3, 5, 7.5, 10, 12.5, 15, 33, 50]) {
      const server = round2(amount - paymentDiscount({ type: 'pix', discount_percent: pct }, amount));
      assert.equal(cashPrice(amount, pct), server, `${amount} ${pct}%`);
    }
  }
  assert.equal(cashPrice(100, 0), 100);
  assert.equal(cashPrice(100, 80), 50, 'no máximo 50%, como o servidor');
  assert.equal(round2(100 - paymentDiscount({ type: 'pix', discount_percent: 80 }, 100)), 50);
});

test('desconto só onde o meio serve (país, mínimo, máximo), como o checkout', () => {
  const m = { type: 'pix', countries: ['BR'], discount_percent: 5, min_total: 20, max_total: 1000 };
  for (const [c, v] of [['BR', 50], ['PT', 50], ['BR', 10], ['BR', 2000], ['br', 20], ['BR', 1000]]) {
    const served = methodBlock({ ...m, is_active: true }, c, v) === null;
    assert.equal(cashDiscountFor(m, c, v) > 0, served, `${c} ${v}`);
  }
  assert.equal(cashDiscountFor(null, 'BR', 10), 0);
  assert.equal(cashDiscountFor({ type: 'pix', discount_percent: '7' }, 'ES', 10), 7);
});

test('parcelas sem juros, com juros (tabela Price) e parcela mínima', () => {
  const s = { ...DEFAULT_PRICE_DISPLAY.installments, enabled: true, max: 12, interestFree: 3, monthlyRate: 2, minValue: 5 };
  const plan = installmentPlan(120, s);
  assert.equal(plan[0].n, 1);
  assert.deepEqual(plan[2], { n: 3, value: 40, total: 120, free: true });
  assert.equal(plan[3].free, false);
  assert.equal(plan[3].value, round2((120 * 0.02) / (1 - Math.pow(1.02, -4))));
  assert.ok(plan[3].total > 120);
  assert.equal(plan.length, 12);
  // parcela mínima: 30 em 10x com mínimo 5 para em 6x
  const small = installmentPlan(30, { ...s, interestFree: 12 });
  assert.equal(small[small.length - 1].n, 6);
  // destaque: maior sem juros ou maior de todas
  assert.equal(headlineInstallment(120, s).n, 3);
  assert.equal(headlineInstallment(120, { ...s, show: 'max' }).n, 12);
  assert.equal(headlineInstallment(8, s), null, 'só 1x não se anuncia');
  // juros 0 = tudo sem juros
  assert.ok(installmentPlan(120, { ...s, monthlyRate: 0 }).every((x) => x.free));
});

test('destaque por lugar e recurso quando falta o destaque', () => {
  const s = normalizePriceDisplay({ installments: { enabled: true, interestFree: 6 }, places: PRICE_PRESETS.cash });
  const v = priceView(100, s, 'product', { cashPct: 10, countryCode: 'BR' });
  assert.equal(v.highlight, 'cash');
  assert.equal(v.main, 90);
  assert.deepEqual(v.cash, { amount: 90, pct: 10, savings: 10 });
  assert.equal(v.installment.n, 6);
  // sem desconto, o destaque Pix volta ao preço do cartão
  const noCash = priceView(100, s, 'product', { cashPct: 0, countryCode: 'BR' });
  assert.equal(noCash.highlight, 'card');
  assert.equal(noCash.main, 100);
  assert.equal(noCash.cash, null);
  // parcelas só nos países escolhidos
  const pt = priceView(100, s, 'product', { cashPct: 0, countryCode: 'PT' });
  assert.equal(pt.installment, null);
  // destaque parcela
  const si = normalizePriceDisplay({ installments: { enabled: true, interestFree: 4 }, places: PRICE_PRESETS.installment });
  const vi = priceView(100, si, 'card', { cashPct: 5, countryCode: 'BR' });
  assert.equal(vi.highlight, 'installment');
  assert.equal(vi.main, 25);
  // lugar desligado e Pix desligado
  const off = normalizePriceDisplay({ places: { ...PRICE_PRESETS.card, checkout: { enabled: false } } });
  assert.equal(priceView(100, off, 'checkout', { cashPct: 10, countryCode: 'BR' }), null);
  const noPix = normalizePriceDisplay({ cash: { enabled: false } });
  assert.equal(priceView(100, noPix, 'product', { cashPct: 10, countryCode: 'BR' }).cash, null);
});

test('regras gravadas com lixo voltam ao padrão', () => {
  assert.deepEqual(normalizePriceDisplay(null), DEFAULT_PRICE_DISPLAY);
  const r = normalizePriceDisplay({ installments: { max: 99, interestFree: 50, monthlyRate: '3.456', countries: ['pt', 'x', 3, 'BR', 'BR'] }, cash: { method: 'DROP TABLE' }, places: { card: { highlight: 'nada' } } });
  assert.equal(r.installments.max, 24);
  assert.equal(r.installments.interestFree, 24);
  assert.equal(r.installments.monthlyRate, 3.46);
  assert.deepEqual(r.installments.countries, ['PT', 'BR']);
  assert.equal(r.cash.method, 'pix');
  assert.equal(r.places.card.highlight, DEFAULT_PRICE_DISPLAY.places.card.highlight);
  for (const p of PRICE_PLACES) for (const preset of Object.values(PRICE_PRESETS)) assert.ok(preset[p], p);
});

test('textos nos 4 idiomas, sem travessões, e recurso no catálogo', () => {
  for (const f of ['src/i18n/priceDisplay.ts', 'src/i18n/adminPriceDisplay.ts']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    for (const l of ["'pt-BR'", "'pt-PT'", 'en:', 'es:']) assert.ok(src.includes(l), `${f} ${l}`);
    assert.ok(!src.includes('—'), `${f} sem travessão`);
  }
  const f = FEATURES.find((x) => x.id === 'price_display');
  assert.ok(f && f.defaultOn && f.sections.includes('price-display'));
});

console.log(`\n${n} testes ok`);
