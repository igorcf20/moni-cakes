// Teste de src/lib/salesStats.ts (estatísticas das páginas de produto e categoria do Admin).
// Rodar: node --experimental-strip-types scripts/test-sales-stats.mjs
import assert from 'node:assert/strict';
import { summarize, timeSeries, breakdown, compareWindows, topCustomers, recentOrders, stockCoverage, inPeriod } from '../src/lib/salesStats.ts';

const now = new Date(2026, 9, 5, 12, 0, 0); // 5/10/2026
const ago = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();
const line = (o) => ({
  orderId: 'o1', createdAt: ago(1), status: 'delivered', paymentStatus: 'paid', userId: 'u1', customerName: 'Ana', country: 'BR',
  productId: 'p1', quantity: 1, price: 10, variation: null, size: null, couponCode: null, ...o,
});

const lines = [
  line({ orderId: 'o1', quantity: 2, price: 10, variation: 'Azul' }),                                  // 20 vendido
  line({ orderId: 'o2', createdAt: ago(10), userId: 'u2', customerName: 'Bia', price: 15, variation: 'Verde' }), // 15 vendido
  line({ orderId: 'o2', createdAt: ago(10), userId: 'u2', customerName: 'Bia', productId: 'p2', price: 5 }),     // 5 vendido (mesmo pedido)
  line({ orderId: 'o3', createdAt: ago(40), status: 'pending', paymentStatus: 'pending', quantity: 3 }),        // pendente
  line({ orderId: 'o4', createdAt: ago(50), status: 'cancelled', quantity: 1 }),                                // cancelado
  line({ orderId: 'o5', createdAt: ago(45), userId: null, customerName: 'Visitante', price: 40 }),              // 40 vendido, 45 dias
];

const s = summarize(lines);
assert.equal(s.revenue, 80);
assert.equal(s.units, 5);
assert.equal(s.orders, 3);
assert.equal(s.customers, 3);
assert.equal(s.avgPrice, 16);
assert.equal(s.avgPerOrder, 26.67);
assert.equal(s.pendingUnits, 3);
assert.equal(s.pendingRevenue, 30);
assert.equal(s.cancelledUnits, 1);
assert.equal(s.cancelRate, 1 / 9);

// período de 30 dias deixa de fora os pedidos de 40, 45 e 50 dias
assert.equal(summarize(inPeriod(lines, '30d', now)).revenue, 40);

// comparação: 40 nos últimos 30 dias contra 40 nos 30 anteriores
assert.deepEqual(compareWindows(lines, 30, now), { current: 40, previous: 40, deltaPct: 0 });
assert.equal(compareWindows([line({ createdAt: ago(1) })], 30, now).deltaPct, null);

// série diária de 30 dias: 30 barras, receita no dia certo
const days = timeSeries(lines, '30d', now);
assert.equal(days.length, 30);
assert.equal(days.reduce((t, b) => t + b.revenue, 0), 40);
assert.equal(days[days.length - 2].revenue, 20); // ontem
// semanal (90 dias) e mensal (12 meses) somam o mesmo total do período
assert.equal(timeSeries(lines, '90d', now).reduce((t, b) => t + b.revenue, 0), 80);
const months = timeSeries(lines, '12m', now);
assert.equal(months.length, 12);
assert.equal(months.reduce((t, b) => t + b.revenue, 0), 80);
assert.equal(timeSeries(lines, 'all', now).reduce((t, b) => t + b.revenue, 0), 80);

// agrupamentos
const byVar = breakdown(lines, (l) => l.variation);
assert.deepEqual(byVar.map((r) => [r.key, r.revenue, r.units]), [['Azul', 20, 2], ['Verde', 15, 1]]);
const byProduct = breakdown(lines, (l) => l.productId);
assert.equal(byProduct[0].key, 'p1');
assert.equal(byProduct[0].revenue, 75);
assert.equal(Math.round(byProduct[1].share * 1000), 63); // 5 de 80

// clientes e pedidos
assert.deepEqual(topCustomers(lines).map((c) => [c.name, c.revenue, c.orders]), [['Visitante', 40, 1], ['Ana', 20, 1], ['Bia', 20, 1]]);
const recent = recentOrders(lines, 3);
assert.deepEqual(recent.map((o) => o.orderId), ['o1', 'o2', 'o3']);
assert.equal(recent[1].value, 20);

// estoque: 4 unidades vendidas em 30 dias (0,13 por dia); 12 em estoque duram 90 dias
const cov = stockCoverage(lines, 12, now);
assert.equal(Math.round(cov.perDay * 10), 1);
assert.equal(cov.days, 90);
assert.equal(stockCoverage([], 12, now).days, null);

console.log('sales stats: all passed');
