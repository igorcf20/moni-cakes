// Teste das assinaturas (src/lib/subscriptions.ts, cópia do servidor, migration, preço no servidor e telas).
// Uso: node --experimental-strip-types scripts/test-subscriptions.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  activePlans, addDays, addInterval, canCustomerCancel, monthlyValue, nextAfterRenewal, normalizePlan, normalizeSubscriptionSettings,
  renewalLate, renewalOpen, subscriptionUnit,
} from '../src/lib/subscriptions.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };
const read = (p) => readFileSync(p, 'utf8');

test('ficheiro igual ao do servidor', () => {
  assert.equal(read('src/lib/subscriptions.ts'), read('supabase/functions/_shared/subscriptions.ts'));
});

test('normalizar regras e planos', () => {
  assert.deepEqual(normalizeSubscriptionSettings(null), { customer_pause: true, customer_cancel: true, renew_days_before: 3 });
  assert.deepEqual(normalizeSubscriptionSettings({ customer_pause: false, renew_days_before: 99 }), { customer_pause: false, customer_cancel: true, renew_days_before: 30 });
  const p = normalizePlan({ id: 'a', product_id: 'p', interval_unit: 'x', interval_count: 0, discount_percent: 150, min_cycles: -2 });
  assert.deepEqual([p.interval_unit, p.interval_count, p.discount_percent, p.min_cycles, p.is_active], ['month', 1, 90, 0, true]);
  assert.equal(normalizePlan({ discount_percent: 12.345 }).discount_percent, 12.35);
});

test('planos ativos pela ordem e pelo intervalo', () => {
  const plans = [
    normalizePlan({ id: '1', product_id: 'p', interval_unit: 'month', interval_count: 2 }),
    normalizePlan({ id: '2', product_id: 'p', interval_unit: 'week', interval_count: 2 }),
    normalizePlan({ id: '3', product_id: 'p', is_active: false }),
    normalizePlan({ id: '4', product_id: 'q' }),
  ];
  assert.deepEqual(activePlans(plans, 'p').map((x) => x.id), ['2', '1']);
});

test('somar intervalo (meses mantêm o dia, sem passar do fim do mês)', () => {
  assert.equal(addInterval('2026-01-31', 'month', 1), '2026-02-28');
  assert.equal(addInterval('2028-01-31', 'month', 1), '2028-02-29');
  assert.equal(addInterval('2026-11-15', 'month', 3), '2027-02-15');
  assert.equal(addInterval('2026-12-28', 'week', 1), '2027-01-04');
  assert.equal(addInterval('2026-10-06', 'week', 2), '2026-10-20');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('próxima data depois da renovação', () => {
  assert.equal(nextAfterRenewal('2026-11-06', '2026-11-04', 'month', 1), '2026-12-06', 'renovou antes: conta da data prevista');
  assert.equal(nextAfterRenewal('2026-11-06', '2026-11-20', 'month', 1), '2026-12-20', 'renovou atrasado: conta de hoje');
});

test('renovação liberada, atrasada e cancelar', () => {
  const s = normalizeSubscriptionSettings({ renew_days_before: 3 });
  const sub = { status: 'active', next_date: '2026-11-10', cycles_done: 1, min_cycles: 3 };
  assert.equal(renewalOpen(sub, '2026-11-06', s), false);
  assert.equal(renewalOpen(sub, '2026-11-07', s), true);
  assert.equal(renewalOpen({ ...sub, status: 'paused' }, '2026-11-08', s), true, 'pausada também pode renovar');
  assert.equal(renewalOpen({ ...sub, status: 'cancelled' }, '2026-11-08', s), false);
  assert.equal(renewalOpen({ ...sub, next_date: 'lixo' }, '2026-11-08', s), false);
  assert.equal(renewalLate(sub, '2026-11-11'), true);
  assert.equal(renewalLate({ ...sub, status: 'paused' }, '2026-11-11'), false);
  assert.equal(canCustomerCancel(sub, s), false, 'antes do mínimo de ciclos');
  assert.equal(canCustomerCancel({ ...sub, cycles_done: 3 }, s), true);
  assert.equal(canCustomerCancel({ ...sub, cycles_done: 3 }, normalizeSubscriptionSettings({ customer_cancel: false })), false);
});

test('preço com desconto e valor por mês', () => {
  assert.equal(subscriptionUnit(100, 10), 90);
  assert.ok(Math.abs(subscriptionUnit(100, 200) - 10) < 1e-9, 'desconto no máximo 90%');
  assert.equal(subscriptionUnit(100, -5), 100);
  assert.equal(monthlyValue(90, 'month', 2), 45);
  assert.ok(Math.abs(monthlyValue(70, 'week', 1) - 304.375) < 1e-9);
});

test('servidor: migration, preço e create-order', () => {
  const m = read('supabase/migrations/20261007090000_subscriptions.sql');
  for (const s of ['product_subscription_plans', 'subscription_orders', 'order_items_subscription', 'orders_subscription_cancel',
    'my_subscription_action', 'admin_subscription_update', "feature_enabled('subscriptions', false)", 'min_cycles']) assert.ok(m.includes(s), s);
  assert.ok(!/^\s*(BEGIN|COMMIT)\s*;/im.test(m), 'sem BEGIN/COMMIT');
  const p = read('supabase/functions/_shared/pricing.ts');
  assert.ok(p.includes('subscriptionDiscounts') && p.includes('subscriptionUnit(unit, subDiscount[lineIdx])'), 'desconto aplicado no servidor');
  assert.ok(p.includes("from \"./subscriptions.ts\""));
});

test('telas: recurso, Admin, conta, produto', () => {
  assert.ok(read('src/lib/features.ts').includes("id: 'subscriptions', category: 'sales', defaultOn: false"));
  assert.ok(read('src/components/admin/shell/adminSections.ts').includes('value: "subscriptions"'));
  assert.ok(read('src/pages/Admin.tsx').includes('subscriptions: <AdminSubscriptions />'));
  assert.ok(read('src/pages/Dashboard.tsx').includes('id: "assinaturas"'));
  assert.ok(read('src/pages/AdminProductEdit.tsx').includes('<ProductSubscriptionPlans'));
  assert.ok(read('src/pages/ProductDetail.tsx').includes('<SubscribeOption'));
  for (const f of ['src/components/admin/AdminSubscriptions.tsx', 'src/components/admin/ProductSubscriptionPlans.tsx', 'src/components/dashboard/SubscriptionsView.tsx']) {
    assert.ok(!/<(Dialog|AlertDialog)\b|window\.confirm|\bconfirm\(/.test(read(f)), `sem janelas em ${f}`);
  }
});

console.log(`\n${n} testes de assinaturas OK`);
