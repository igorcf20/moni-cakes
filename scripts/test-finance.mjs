// Teste de src/lib/finance.ts (Admin > Financeiro).
// Rodar: node --experimental-strip-types scripts/test-finance.mjs
import assert from 'node:assert/strict';
import {
  normalizeFinanceSettings, DEFAULT_FINANCE_SETTINGS, orderFinance, summarize, waterfall, presetRange, compareRange, inRange,
  financeSeries, cashFlow, splitBy, productSplit, entrySplit, monthlyDates, toBaseAmount, isOverdue, goalProgress, delta,
  inStatusGroup, autoGrain, orderDate,
} from '../src/lib/finance.ts';

const order = (o = {}) => ({
  id: 'o1', createdAt: new Date(2026, 9, 3, 10).toISOString(), paidAt: null, status: 'delivered', paymentStatus: 'paid',
  paymentMethod: 'pix', country: 'BR', customerKey: 'u1', customerName: 'Ana', userId: 'u1',
  total: 120, vat: 0, shipping: 20, couponDiscount: 10, paymentDiscount: 0, giftCard: 0, points: 0, refunded: 0, commission: 0,
  items: [
    { productId: 'p1', quantity: 2, price: 30, unitCost: 10, categoryIds: ['c1'] },
    { productId: 'p2', quantity: 1, price: 50, unitCost: null, categoryIds: ['c2'] },
  ],
  ...o,
});

// Regras: valores fora do limite e lixo são corrigidos.
{
  const s = normalizeFinanceSettings({ dateBasis: 'x', shippingCostPercent: 999, salesTaxPercent: '6', paymentFees: { pix: { percent: 0.99, fixed: '0.5' }, 'BAD KEY': { percent: 1 }, card: { percent: 0, fixed: 0 } }, monthlyGoal: -5 });
  assert.equal(s.dateBasis, 'order');
  assert.equal(s.shippingCostPercent, 300);
  assert.equal(s.salesTaxPercent, 6);
  assert.deepEqual(s.paymentFees, { pix: { percent: 0.99, fixed: 0.5 } });
  assert.equal(s.monthlyGoal, null);
  assert.equal(s.includeAffiliateCommissions, true);
  assert.deepEqual(normalizeFinanceSettings(null), DEFAULT_FINANCE_SETTINGS);
}

// Um pedido: faturamento, imposto estimado, frete, taxa, custo e lucro.
const S = normalizeFinanceSettings({ salesTaxPercent: 10, shippingCostPercent: 50, paymentFees: { pix: { percent: 1, fixed: 0.5 } } });
{
  const r = orderFinance(order(), S);
  assert.equal(r.gross, 120);
  assert.equal(r.taxes, 12); // 10% de 120 (sem imposto à parte)
  assert.equal(r.shippingCost, 10); // 50% de 20
  assert.equal(r.fees, 1.7); // 1% de 120 + 0,50
  assert.equal(r.productCost, 20); // só p1 tem custo
  assert.equal(r.missingCostValue, 50);
  assert.equal(r.discounts, 10);
  assert.equal(r.units, 3);
  assert.equal(r.profit, 120 - 12 - 10 - 1.7 - 20);
}

// Imposto à parte (IVA): o imposto gravado conta inteiro e a estimativa só sobre o resto.
{
  const r = orderFinance(order({ total: 123, vat: 23 }), normalizeFinanceSettings({ salesTaxPercent: 10 }));
  assert.equal(r.taxes, 33);
}

// Filtro por produto: o pedido conta em proporção ao valor dos itens escolhidos.
{
  const r = orderFinance(order(), S, (i) => i.productId === 'p1');
  assert.ok(Math.abs(r.share - 60 / 110) < 1e-9);
  assert.equal(r.gross, Math.round(120 * 60 / 110 * 100) / 100);
  assert.equal(r.productCost, 20);
  assert.equal(r.missingCostValue, 0);
  assert.equal(r.units, 2);
  const none = orderFinance(order(), S, () => false);
  assert.equal(none.share, 0);
  assert.equal(none.gross, 0);
}

// Comissão de afiliado só quando as regras mandam contar; reembolso parcial nunca passa do total.
{
  const s2 = normalizeFinanceSettings({ includeAffiliateCommissions: false });
  assert.equal(orderFinance(order({ commission: 8 }), s2).commission, 0);
  assert.equal(orderFinance(order({ commission: 8 }), DEFAULT_FINANCE_SETTINGS).commission, 8);
  assert.equal(orderFinance(order({ refunded: 999 }), DEFAULT_FINANCE_SETTINGS).refunds, 120);
}

// Situação do pedido.
assert.equal(inStatusGroup({ status: 'delivered', paymentStatus: 'paid' }, 'paid'), true);
assert.equal(inStatusGroup({ status: 'refunded', paymentStatus: 'paid' }, 'paid'), false);
assert.equal(inStatusGroup({ status: 'refunded', paymentStatus: 'paid' }, 'cancelled'), true);
assert.equal(inStatusGroup({ status: 'pending', paymentStatus: 'pending' }, 'pending'), true);
assert.equal(inStatusGroup({ status: 'pending', paymentStatus: 'pending' }, 'all'), true);

// Data que conta: do pedido ou do pagamento.
assert.equal(orderDate({ createdAt: 'a', paidAt: 'b' }, 'payment'), 'b');
assert.equal(orderDate({ createdAt: 'a', paidAt: null }, 'payment'), 'a');
assert.equal(orderDate({ createdAt: 'a', paidAt: 'b' }, 'order'), 'a');

// Soma com lançamentos e o caminho do faturamento ao lucro.
const entries = [
  { id: 'e1', kind: 'expense', categoryId: 'rent', description: 'Aluguel', amount: 30, occurredOn: '2026-10-02', dueOn: null, status: 'paid' },
  { id: 'e2', kind: 'income', categoryId: 'svc', description: 'Serviço', amount: 15, occurredOn: '2026-10-04', dueOn: null, status: 'paid' },
  { id: 'e3', kind: 'expense', categoryId: 'rent', description: 'Luz', amount: 12, occurredOn: '2026-10-01', dueOn: '2026-10-20', status: 'pending' },
  { id: 'e4', kind: 'expense', categoryId: null, description: 'Sem taxa', amount: null, occurredOn: '2026-10-01', dueOn: null, status: 'paid' },
];
const rows = [orderFinance(order(), S), orderFinance(order({ id: 'o2', total: 80, shipping: 0, couponDiscount: 0, paymentMethod: 'card', country: 'PT', items: [{ productId: 'p1', quantity: 1, price: 80, unitCost: 10, categoryIds: ['c1'] }] }), S)];
{
  const sum = summarize(rows, entries);
  assert.equal(sum.orders, 2);
  assert.equal(sum.gross, 200);
  assert.equal(sum.expenses, 30);
  assert.equal(sum.otherIncome, 15);
  assert.equal(sum.toPay, 12);
  assert.equal(sum.toReceive, 0);
  assert.equal(sum.avgTicket, 100);
  const salesProfit = rows[0].profit + rows[1].profit;
  assert.equal(sum.salesProfit, Math.round(salesProfit * 100) / 100);
  assert.equal(sum.profit, Math.round((salesProfit - 30 + 15) * 100) / 100);
  assert.ok(Math.abs(sum.margin - sum.profit / 215) < 1e-9);
  assert.equal(sum.net, 200 - sum.taxes);
  const w = waterfall(sum);
  assert.equal(w[0].key, 'gross');
  assert.equal(w.at(-1).key, 'profit');
  assert.equal(w.at(-1).end, sum.profit);
  assert.ok(w.every((x, i) => i === 0 || x.kind === 'result' || Math.abs(x.start - w[i - 1].end) < 0.011));
  assert.equal(summarize([], []).margin, null);
}

// Períodos.
const now = new Date(2026, 9, 8, 15);
{
  const m = presetRange('month', now);
  assert.equal(+m.from, +new Date(2026, 9, 1));
  assert.equal(+m.to, +new Date(2026, 9, 9));
  const lm = presetRange('last_month', now);
  assert.equal(+lm.from, +new Date(2026, 8, 1));
  assert.equal(+lm.to, +new Date(2026, 9, 1));
  const prev = compareRange(lm, 'previous');
  assert.equal(+prev.from, +new Date(2026, 7, 1));
  assert.equal(+prev.to, +new Date(2026, 8, 1));
  const d30 = presetRange('30d', now);
  const p30 = compareRange(d30, 'previous');
  assert.equal((+p30.to - +p30.from) / 86_400_000, 30);
  assert.equal(+p30.to, +d30.from);
  const y = compareRange(m, 'year');
  assert.equal(+y.from, +new Date(2025, 9, 1));
  assert.equal(compareRange(m, 'none'), null);
  const c = presetRange('custom', now, { from: '2026-10-05', to: '2026-10-01' });
  assert.equal(+c.from, +new Date(2026, 9, 1));
  assert.equal(+c.to, +new Date(2026, 9, 6));
  assert.equal(inRange('2026-10-05', c), true);
  assert.equal(inRange('2026-10-06', c), false);
  assert.equal(autoGrain(d30), 'day');
  assert.equal(autoGrain(presetRange('90d', now)), 'week');
  assert.equal(autoGrain(presetRange('12m', now)), 'month');
  const all = presetRange('all', now, undefined, new Date(2025, 2, 17));
  assert.equal(+all.from, +new Date(2025, 2, 1));
}

// Série por dia e fluxo de caixa.
{
  const r = presetRange('month', now);
  const pts = financeSeries(rows, entries, r, 'day');
  assert.equal(pts.length, 8);
  const d3 = pts[2];
  assert.equal(d3.revenue, 200);
  assert.equal(d3.orders, 2);
  assert.equal(pts[1].costs, 30); // aluguel no dia 2
  assert.equal(pts[3].revenue, 15); // entrada no dia 4
  const totalProfit = pts.reduce((t, p) => t + p.profit, 0);
  assert.ok(Math.abs(totalProfit - summarize(rows, entries).profit) < 0.02);
  const cf = cashFlow(rows, entries, presetRange('12m', now));
  assert.equal(cf.length, 12);
  assert.ok(Math.abs(cf.at(-1).cumulative - summarize(rows, entries).profit) < 0.02);
}

// Divisões.
{
  const pay = splitBy(rows, (r) => r.order.paymentMethod);
  assert.equal(pay[0].key, 'pix');
  assert.equal(pay[0].gross, 120);
  assert.ok(Math.abs(pay[0].share - 0.6) < 1e-9);
  const ps = productSplit(rows);
  const p1 = ps.find((x) => x.productId === 'p1');
  assert.equal(p1.units, 3);
  assert.equal(p1.revenue, 140);
  assert.equal(p1.profit, 110);
  assert.equal(ps.find((x) => x.productId === 'p2').profit, null);
  assert.equal(productSplit(rows, (i) => i.categoryIds.includes('c2')).length, 1);
  const es = entrySplit(entries, 'expense');
  assert.deepEqual(es.map((x) => x.key), ['rent']);
  assert.equal(es[0].amount, 30);
}

// Lançamentos: repetição mensal, câmbio e vencimento.
assert.deepEqual(monthlyDates('2026-01-31', 3), ['2026-01-31', '2026-02-28', '2026-03-31']);
assert.equal(monthlyDates('2026-05-10', 0).length, 1);
assert.equal(monthlyDates('2026-05-10', 999).length, 60);
assert.equal(toBaseAmount(1050, 'BRL', 'BRL', {}), 10.5);
assert.equal(toBaseAmount(1000, 'EUR', 'BRL', { EUR: 0.2 }), 50);
assert.equal(toBaseAmount(1000, 'USD', 'BRL', {}), null);
assert.equal(isOverdue({ status: 'pending', dueOn: '2026-10-07', occurredOn: '2026-10-01' }, now), true);
assert.equal(isOverdue({ status: 'pending', dueOn: '2026-10-08', occurredOn: '2026-10-01' }, now), false);
assert.equal(isOverdue({ status: 'paid', dueOn: '2026-10-01', occurredOn: '2026-10-01' }, now), false);

// Meta e variação.
{
  const g = goalProgress(1000, 400, new Date(2026, 9, 10));
  assert.equal(g.projected, Math.round(400 / 10 * 31 * 100) / 100);
  assert.equal(g.onTrack, true);
  assert.equal(goalProgress(null, 400), null);
  assert.equal(delta(120, 100), 0.2);
  assert.equal(delta(5, 0), null);
  assert.equal(delta(-50, -100), 0.5);
}

console.log('test-finance: ok');
