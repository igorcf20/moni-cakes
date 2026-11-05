// Teste do vale-presente (src/lib/giftCards.ts). Uso: node --experimental-strip-types scripts/test-gift-cards.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatGiftCode, generateGiftCode, giftApplied, giftCardState, giftCodeTail, isGiftCode, normalizeGiftCode } from '../src/lib/giftCards.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

test('código normalizado e formatado', () => {
  assert.equal(normalizeGiftCode(' abcd-efgh 1234 '), 'ABCDEFGH1234');
  assert.equal(formatGiftCode('abcdefgh12345678'), 'ABCD-EFGH-1234-5678');
  assert.equal(formatGiftCode('ABCDEFGHJ'), 'ABCD-EFGH-J');
  assert.equal(giftCodeTail('ABCD-EFGH-1234'), '1234');
  assert.equal(isGiftCode('ab-cd'), false);
  assert.equal(isGiftCode('ABCD-EFGH'), true);
});

test('gerador sem caracteres confusos', () => {
  for (let i = 0; i < 50; i += 1) {
    const c = generateGiftCode();
    assert.equal(c.length, 16);
    assert.ok(isGiftCode(c));
    assert.ok(!/[01OIL]/.test(c), c);
  }
});

test('desconto até zerar o pedido', () => {
  assert.equal(giftApplied(50, 120.5), 50);
  assert.equal(giftApplied(200, 120.555), 120.56);
  assert.equal(giftApplied(-5, 10), 0);
  assert.equal(giftApplied(10, -1), 0);
});

test('situação do vale', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  assert.equal(giftCardState({ is_active: false, balance: 10, expires_at: null }, now), 'disabled');
  assert.equal(giftCardState({ is_active: true, balance: 10, expires_at: '2026-10-01T00:00:00Z' }, now), 'expired');
  assert.equal(giftCardState({ is_active: true, balance: 0, expires_at: null }, now), 'used');
  assert.equal(giftCardState({ is_active: true, balance: 5, expires_at: '2027-01-01T00:00:00Z' }, now), 'active');
});

test('mesma regra de código no servidor', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261006190000_gift_cards.sql', import.meta.url), 'utf8');
  assert.ok(sql.includes("'^[A-Z0-9]{6,32}$'"));
  assert.ok(sql.includes("regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g')"));
});

console.log(`${n} testes ok`);
