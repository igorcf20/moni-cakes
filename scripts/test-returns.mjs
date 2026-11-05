// Teste das regras de devolução mostradas no site (src/lib/returns.ts). O servidor confere de novo em request_return.
//   node --experimental-strip-types scripts/test-returns.mjs
import assert from 'node:assert/strict';
import {
  DEFAULT_RETURN_SETTINGS, canRequestReturn, normalizeReturnSettings, returnDeadline, returnErrorCode, returnableQuantities,
} from '../src/lib/returns.ts';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`ok ${name}`); };
const day = 86_400_000;
const now = new Date('2026-10-06T12:00:00Z');
const ago = (d) => new Date(now.getTime() - d * day).toISOString();

ok('regras vazias = padrão; ações desconhecidas fora', () => {
  assert.deepEqual(normalizeReturnSettings(null), DEFAULT_RETURN_SETTINGS);
  const s = normalizeReturnSettings({ enabled: false, days: 14.4, actions: ['refund', 'voar', 'refund'] });
  assert.deepEqual(s, { enabled: false, days: 14, actions: ['refund'] });
  assert.equal(normalizeReturnSettings({ days: -3 }).days, 30);
  assert.equal(normalizeReturnSettings({ days: 9999 }).days, 365);
});

ok('prazo conta da entrega, senão do envio, senão da compra', () => {
  const s = { enabled: true, days: 7, actions: ['refund'] };
  assert.equal(returnDeadline({ status: 'delivered', created_at: ago(30), delivered_at: ago(2) }, s).toISOString(), new Date(now.getTime() + 5 * day).toISOString());
  assert.equal(returnDeadline({ status: 'shipped', created_at: ago(30), shipped_at: ago(1) }, s).toISOString(), new Date(now.getTime() + 6 * day).toISOString());
});

ok('só pedidos enviados ou entregues, dentro do prazo e com devoluções ligadas', () => {
  const s = { enabled: true, days: 7, actions: ['refund'] };
  assert.equal(canRequestReturn({ status: 'delivered', created_at: ago(10), delivered_at: ago(3) }, s, now), true);
  assert.equal(canRequestReturn({ status: 'delivered', created_at: ago(10), delivered_at: ago(8) }, s, now), false);
  assert.equal(canRequestReturn({ status: 'paid', created_at: ago(1) }, s, now), false);
  assert.equal(canRequestReturn({ status: 'delivered', created_at: ago(1) }, { ...s, enabled: false }, now), false);
});

ok('quantidade que ainda se pode devolver desconta devoluções não recusadas', () => {
  const q = returnableQuantities(
    [{ id: 'a', quantity: 3 }, { id: 'b', quantity: 1 }],
    [
      { status: 'completed', items: [{ order_item_id: 'a', quantity: 1 }] },
      { status: 'rejected', items: [{ order_item_id: 'a', quantity: 2 }, { order_item_id: 'b', quantity: 1 }] },
    ],
  );
  assert.deepEqual(q, { a: 2, b: 1 });
});

ok('erros do servidor viram códigos', () => {
  assert.equal(returnErrorCode({ message: 'return_window_closed' }), 'return_window_closed');
  assert.equal(returnErrorCode(new Error('qualquer outra coisa')), null);
});

console.log(`${n} testes ok`);
