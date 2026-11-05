// Teste dos campos extra no checkout (src/lib/checkoutFields.ts, cópia do servidor e migration).
// Uso: node --experimental-strip-types scripts/test-checkout-fields.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  answerLines, answerText, fieldInputErrors, fieldsFor, localText, normalizeField, orderAnswerLines,
} from '../src/lib/checkoutFields.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

const gift = normalizeField({ id: 'g', name: 'Embrulho', kind: 'checkbox', label_i18n: { 'pt-BR': 'Embrulhar', en: 'Wrap' }, price: '7.5', display_order: 20 });
const time = normalizeField({
  id: 't', name: 'Horário', kind: 'select', required: true, label_i18n: { 'pt-BR': 'Horário' }, price: 99, display_order: 10,
  options: [{ id: 'manha', label_i18n: { 'pt-BR': 'Manhã' }, price: 0 }, { id: 'noite', label_i18n: { 'pt-BR': 'Noite', en: 'Evening' }, price: 12.345 }],
});
const card = normalizeField({ id: 'c', name: 'Cartão', kind: 'textarea', max_length: 10, price: 2, countries: ['br', 'XX1'], display_order: 30 });
const off = normalizeField({ id: 'o', name: 'Off', kind: 'text', is_active: false });

test('ficheiro igual ao do servidor', () => {
  assert.equal(readFileSync('src/lib/checkoutFields.ts', 'utf8'), readFileSync('supabase/functions/_shared/checkoutFields.ts', 'utf8'));
});

test('normalizar: preço, opções, países, tipo', () => {
  assert.equal(gift.price, 7.5);
  assert.equal(time.price, 0, 'lista não tem preço próprio');
  assert.equal(time.options[1].price, 12.35);
  assert.deepEqual(card.countries, ['BR']);
  assert.equal(normalizeField({ kind: 'nada', price: -5 }).kind, 'checkbox');
  assert.equal(normalizeField({ kind: 'text', price: -5 }).price, 0);
  assert.equal(normalizeField({ kind: 'text', max_length: 99999 }).max_length, 1000);
});

test('campos por país e ordem', () => {
  const all = [gift, time, card, off];
  assert.deepEqual(fieldsFor(all, 'br').map((f) => f.id), ['t', 'g', 'c']);
  assert.deepEqual(fieldsFor(all, 'PT').map((f) => f.id), ['t', 'g']);
});

test('respostas: obrigatório, opção, texto, preço', () => {
  const fields = [time, gift, card];
  let r = answerLines(fields, {});
  assert.deepEqual(r.errors, [{ field_id: 't', code: 'required' }]);
  assert.equal(r.total, 0);
  r = answerLines(fields, { t: 'xx' });
  assert.deepEqual(r.errors, [{ field_id: 't', code: 'invalid_option' }]);
  r = answerLines(fields, { t: 'noite', g: true, c: '  Parabéns  ', z: true });
  assert.deepEqual(r.errors, []);
  assert.equal(r.total, 21.85);
  assert.equal(r.lines.length, 3);
  assert.equal(r.lines[2].value, 'Parabéns');
  r = answerLines(fields, { t: 'manha', g: 'true', c: '12345678901' });
  assert.deepEqual(r.errors, [{ field_id: 'c', code: 'too_long' }]);
  assert.equal(r.lines.length, 1, 'caixa só conta com true');
  assert.equal(answerLines(fields, 'lixo').errors.length, 1);
});

test('textos por idioma e no pedido', () => {
  assert.equal(localText({ 'pt-BR': 'A', en: 'B' }, 'en'), 'B');
  assert.equal(localText({ 'pt-BR': 'A' }, 'es'), 'A');
  assert.equal(localText({}, 'es', 'X'), 'X');
  const lines = answerLines([time], { t: 'noite' }).lines;
  assert.equal(answerText(lines[0], 'en', 'Yes'), 'Evening');
  assert.deepEqual(orderAnswerLines(JSON.parse(JSON.stringify(lines))).map((l) => l.price), [12.35]);
  assert.deepEqual(orderAnswerLines(null), []);
  assert.deepEqual(orderAnswerLines([{ x: 1 }]), []);
});

test('formulário do Admin', () => {
  assert.deepEqual(fieldInputErrors(normalizeField({ kind: 'select' })), ['name', 'label', 'options']);
  assert.deepEqual(fieldInputErrors(normalizeField({ name: 'x', kind: 'select', label_i18n: { en: 'x' }, options: [{ id: 'a' }] })), ['option_label']);
  assert.deepEqual(fieldInputErrors(gift), []);
});

test('servidor: create-order soma e grava; colunas protegidas; edição mantém extras; recurso e Admin', () => {
  const fn = readFileSync('supabase/functions/create-order/index.ts', 'utf8');
  assert.ok(fn.includes('sb.rpc("feature_enabled", { _key: "checkout_fields", _default: true })'));
  assert.ok(fn.includes('shippingGross + extrasNet + extrasVat - coupon.discount'));
  assert.ok(fn.includes('checkout_fields: extrasLines, extras_amount: extrasNet, extras_vat: extrasVat'));
  const sql = readFileSync('supabase/migrations/20261007060000_checkout_fields.sql', 'utf8');
  assert.ok(sql.includes('NEW.extras_amount       := OLD.extras_amount;'));
  assert.ok(sql.includes('COALESCE(o.extras_amount, 0) + COALESCE(o.extras_vat, 0)'));
  assert.ok(sql.includes('CREATE TRIGGER zz_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.checkout_fields'));
  assert.ok(!/\bBEGIN;|\bCOMMIT;|CONCURRENTLY/.test(sql));
  assert.ok(readFileSync('src/lib/features.ts', 'utf8').includes("{ id: 'checkout_fields', category: 'sales', defaultOn: true"));
  assert.ok(readFileSync('src/pages/Admin.tsx', 'utf8').includes('"checkout-fields": <AdminCheckoutFields />'));
  for (const f of ['src/i18n/checkoutFields.ts', 'src/i18n/adminCheckoutFields.ts']) assert.ok(!/—/.test(readFileSync(f, 'utf8')), f);
});

console.log(`\n${n} testes ok`);
