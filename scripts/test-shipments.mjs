// Teste dos envios parciais (src/lib/shipments.ts e as regras da migration 20261007080000_order_shipments.sql).
// Uso: node --experimental-strip-types scripts/test-shipments.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { draftErrors, normalizeShipments, remainingByItem, shipmentProgress } from '../src/lib/shipments.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

const lines = [{ id: 'a', quantity: 2 }, { id: 'b', quantity: 1 }];
const ship = (id, number, status, items) => ({ id, order_id: 'o', number, status, carrier: null, tracking_code: null, tracking_url: null, note: null, shipped_at: null, delivered_at: null, created_at: '', items });
const s1 = ship('s1', 1, 'shipped', [{ order_item_id: 'a', quantity: 1 }]);
const s2 = ship('s2', 2, 'preparing', [{ order_item_id: 'a', quantity: 1 }, { order_item_id: 'b', quantity: 1 }]);

test('o que falta enviar, sem contar a remessa em edição', () => {
  assert.deepEqual(remainingByItem(lines, []), { a: 2, b: 1 });
  assert.deepEqual(remainingByItem(lines, [s1]), { a: 1, b: 1 });
  assert.deepEqual(remainingByItem(lines, [s1, s2]), { a: 0, b: 0 });
  assert.deepEqual(remainingByItem(lines, [s1, s2], 's2'), { a: 1, b: 1 });
  assert.deepEqual(remainingByItem(lines, [ship('x', 3, 'shipped', [{ order_item_id: 'a', quantity: 9 }, { order_item_id: 'zz', quantity: 1 }])]), { a: 0, b: 1 });
});

test('rascunho do Admin: mesmos códigos do servidor', () => {
  const rem = { a: 1, b: 1 };
  assert.deepEqual(draftErrors({ a: 1, b: 0 }, rem), { items: [{ order_item_id: 'a', quantity: 1 }], error: null });
  assert.equal(draftErrors({ a: 0, b: 0 }, rem).error, 'no_items');
  assert.equal(draftErrors({ a: 2 }, rem).error, 'too_many');
  assert.equal(draftErrors({ a: 1.5 }, rem).error, 'invalid_item');
  assert.equal(draftErrors({ a: -1 }, rem).error, 'invalid_item');
  assert.equal(draftErrors({ q: 1 }, rem).error, 'invalid_item');
});

test('progresso: nenhum, em parte, tudo enviado, tudo entregue', () => {
  assert.deepEqual(shipmentProgress(lines, []), { total: 3, shipped: 0, delivered: 0, state: 'none' });
  assert.equal(shipmentProgress(lines, [s1, s2]).state, 'partial', 'remessa em preparação não conta como enviada');
  assert.equal(shipmentProgress(lines, [s1, { ...s2, status: 'shipped' }]).state, 'shipped');
  const d = shipmentProgress(lines, [{ ...s1, status: 'delivered' }, { ...s2, status: 'delivered' }]);
  assert.deepEqual(d, { total: 3, shipped: 3, delivered: 3, state: 'delivered' });
  assert.equal(shipmentProgress([], []).state, 'none');
});

test('normalizar linhas da base', () => {
  const rows = normalizeShipments([
    { id: 's2', number: 2, status: 'xx', order_shipment_items: [{ order_item_id: 'a', quantity: '2' }, { order_item_id: 'b', quantity: 0 }] },
    { id: 's1', number: 1, status: 'delivered', order_shipment_items: [] },
    null,
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['s1', 's2']);
  assert.equal(rows[1].status, 'shipped');
  assert.deepEqual(rows[1].items, [{ order_item_id: 'a', quantity: 2 }]);
  assert.deepEqual(normalizeShipments('lixo'), []);
});

test('servidor: funções, guardas, RLS, recurso e Admin', () => {
  const sql = readFileSync('supabase/migrations/20261007080000_order_shipments.sql', 'utf8');
  assert.ok(sql.includes("IF NOT public.feature_enabled('partial_shipments', false) THEN RAISE EXCEPTION 'feature_off'"));
  assert.ok(sql.includes("IF other + qty > ordered THEN RAISE EXCEPTION 'too_many'"));
  assert.ok(sql.includes("o.status IN ('paid', 'preparing')"), 'só passa a Enviado a partir de pago ou em preparação');
  assert.ok(sql.includes("RAISE EXCEPTION 'shipped_items'"));
  assert.ok(sql.includes('IF pg_trigger_depth() > 1'), 'apagar o pedido inteiro continua a funcionar');
  assert.ok(sql.includes('o.user_id = auth.uid()'));
  assert.ok(!/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*TO authenticated/.test(sql), 'cliente e Admin só escrevem pelas funções');
  assert.ok(!/\bBEGIN;|\bCOMMIT;|CONCURRENTLY/.test(sql));
  assert.ok(readFileSync('src/lib/features.ts', 'utf8').includes("{ id: 'partial_shipments', category: 'orders', defaultOn: false }"));
  assert.ok(readFileSync('src/pages/admin/AdminOrderPage.tsx', 'utf8').includes('<OrderShipmentsPanel'));
  assert.ok(readFileSync('src/components/dashboard/OrderHistory.tsx', 'utf8').includes('<OrderShipments'));
  assert.ok(readFileSync('src/components/admin/orders/OrderItemsEditor.tsx', 'utf8').includes('shipped_items: "edit_err_shipped"'));
  for (const f of ['src/i18n/shipments.ts', 'src/i18n/adminShipments.ts']) assert.ok(!/—/.test(readFileSync(f, 'utf8')), f);
});

console.log(`\n${n} testes ok`);
