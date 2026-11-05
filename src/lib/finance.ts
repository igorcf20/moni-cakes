// =====================================================================================
// Financeiro do Admin (recurso finance): contas puras sobre pedidos e lançamentos manuais.
// As consultas ficam em src/hooks/useFinance.ts e as telas em src/components/admin/finance/*.
// Sem imports com @/ para o teste em node (scripts/test-finance.mjs).
//
// Pedido de venda (por pedido, na moeda base da loja, como orders grava):
//   Faturamento      orders.total (o que o cliente pagou: produtos, frete e imposto, menos descontos e vale)
//   Impostos         orders.vat_total (imposto à parte, ex.: IVA) + imposto sobre vendas estimado (% das regras)
//                    sobre o resto, para países com preço final (ex.: Simples Nacional no Brasil)
//   Reembolsos       devoluções parciais de dinheiro em pedidos pagos (payment_refunds)
//   Frete (custo)    frete cobrado x % das regras (100% = a loja paga à transportadora o que cobrou)
//   Taxas            taxa do meio de pagamento das regras: % do total + valor fixo por pedido
//   Custo produtos   products.cost_price x unidades (produto sem custo entra em "sem custo", fora do lucro)
//   Comissões        comissão de afiliado ativa (affiliate_ledger), se as regras mandarem contar
//   Lucro            faturamento - impostos - reembolsos - frete - taxas - custo produtos - comissões
// Lançamentos manuais (finance_entries): despesas e outras entradas, pagos (contam na data) ou por pagar / receber.
// Lucro líquido do período = lucro dos pedidos - despesas pagas + outras entradas recebidas.
// Filtro por produto ou categoria: cada pedido conta só a parte dos itens escolhidos (valores do pedido em proporção).
// =====================================================================================

export type DateBasis = 'order' | 'payment';

export type PaymentFee = { percent: number; fixed: number };

export type FinanceSettings = {
  /** Data que conta para o período: do pedido (como as Estatísticas) ou do pagamento. */
  dateBasis: DateBasis;
  /** Quanto do frete cobrado é custo da loja (100 = paga à transportadora o mesmo valor). */
  shippingCostPercent: number;
  /** Imposto sobre vendas estimado (%) sobre o faturamento sem imposto à parte. 0 = não estimar. */
  salesTaxPercent: number;
  /** Taxa de cada meio de pagamento (tipo de payment_config): % do total e valor fixo por pedido. */
  paymentFees: Record<string, PaymentFee>;
  /** Contar as comissões de afiliados como custo. */
  includeAffiliateCommissions: boolean;
  /** Meta de faturamento por mês (moeda base). null = sem meta. */
  monthlyGoal: number | null;
};

export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  dateBasis: 'order',
  shippingCostPercent: 100,
  salesTaxPercent: 0,
  paymentFees: {},
  includeAffiliateCommissions: true,
  monthlyGoal: null,
};

const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function normalizeFinanceSettings(raw: unknown): FinanceSettings {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fees: Record<string, PaymentFee> = {};
  const rawFees = o.paymentFees && typeof o.paymentFees === 'object' && !Array.isArray(o.paymentFees) ? (o.paymentFees as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(rawFees)) {
    if (!/^[a-z0-9_]{1,40}$/.test(k) || !v || typeof v !== 'object') continue;
    const f = v as Record<string, unknown>;
    const fee = { percent: round2(num(f.percent, 0, 50, 0)), fixed: round2(num(f.fixed, 0, 100000, 0)) };
    if (fee.percent || fee.fixed) fees[k] = fee;
  }
  const goal = num(o.monthlyGoal, 0, 1e12, 0);
  return {
    dateBasis: o.dateBasis === 'payment' ? 'payment' : 'order',
    shippingCostPercent: round2(num(o.shippingCostPercent, 0, 300, DEFAULT_FINANCE_SETTINGS.shippingCostPercent)),
    salesTaxPercent: round2(num(o.salesTaxPercent, 0, 60, 0)),
    paymentFees: fees,
    includeAffiliateCommissions: typeof o.includeAffiliateCommissions === 'boolean' ? o.includeAffiliateCommissions : true,
    monthlyGoal: goal > 0 ? round2(goal) : null,
  };
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/* ---------------------------------------------------------------------------------- */
/* Pedidos                                                                             */
/* ---------------------------------------------------------------------------------- */

export type FinItem = { productId: string; quantity: number; price: number; unitCost: number | null; categoryIds: string[] };

export type FinOrder = {
  id: string;
  createdAt: string;
  paidAt: string | null;
  status: string;
  paymentStatus: string | null;
  paymentMethod: string | null;
  country: string | null;
  customerKey: string;
  customerName: string;
  userId: string | null;
  total: number;
  vat: number;
  shipping: number;
  couponDiscount: number;
  paymentDiscount: number;
  giftCard: number;
  points: number;
  /** Soma dos reembolsos parciais registados (payment_refunds). */
  refunded: number;
  /** Comissão de afiliado ativa (affiliate_ledger). */
  commission: number;
  items: FinItem[];
};

export type StatusGroup = 'paid' | 'pending' | 'cancelled' | 'all';

const CANCELLED = new Set(['cancelled', 'refunded']);
export const isCancelledOrder = (o: Pick<FinOrder, 'status'>) => CANCELLED.has(o.status);
export const isPaidOrder = (o: Pick<FinOrder, 'status' | 'paymentStatus'>) => o.paymentStatus === 'paid' && !isCancelledOrder(o);
export const isPendingOrder = (o: Pick<FinOrder, 'status' | 'paymentStatus'>) => !isPaidOrder(o) && !isCancelledOrder(o);

export function inStatusGroup(o: Pick<FinOrder, 'status' | 'paymentStatus'>, g: StatusGroup) {
  if (g === 'all') return true;
  if (g === 'paid') return isPaidOrder(o);
  if (g === 'pending') return isPendingOrder(o);
  return isCancelledOrder(o);
}

/** Data que conta para o período. */
export const orderDate = (o: Pick<FinOrder, 'createdAt' | 'paidAt'>, basis: DateBasis) =>
  basis === 'payment' && o.paidAt ? o.paidAt : o.createdAt;

export type FinRow = {
  order: FinOrder;
  date: string;
  /** Parte do pedido que conta (1 sem filtro de produto ou categoria). */
  share: number;
  gross: number;
  taxes: number;
  refunds: number;
  shippingCharged: number;
  shippingCost: number;
  fees: number;
  productCost: number;
  /** Valor dos itens sem custo preenchido (o custo deles não entra). */
  missingCostValue: number;
  commission: number;
  discounts: number;
  units: number;
  profit: number;
};

/** Números de um pedido. itemFilter = só os itens escolhidos contam (filtro de produto ou categoria). */
export function orderFinance(o: FinOrder, s: FinanceSettings, itemFilter?: (i: FinItem) => boolean): FinRow {
  const itemsValue = o.items.reduce((t, i) => t + i.price * i.quantity, 0);
  const chosen = itemFilter ? o.items.filter(itemFilter) : o.items;
  const chosenValue = chosen.reduce((t, i) => t + i.price * i.quantity, 0);
  const share = !itemFilter ? 1 : itemsValue > 0 ? chosenValue / itemsValue : 0;
  const total = Math.max(0, o.total);
  const vat = Math.max(0, o.vat);
  const fee = s.paymentFees[o.paymentMethod ?? ''];
  const feeValue = fee && total > 0 ? (total * fee.percent) / 100 + fee.fixed : 0;
  const productCost = chosen.reduce((t, i) => t + (i.unitCost != null ? i.unitCost * i.quantity : 0), 0);
  const missingCostValue = chosen.reduce((t, i) => t + (i.unitCost == null ? i.price * i.quantity : 0), 0);
  const gross = total * share;
  const taxes = (vat + (Math.max(0, total - vat) * s.salesTaxPercent) / 100) * share;
  const refunds = Math.min(total, Math.max(0, o.refunded)) * share;
  const shippingCharged = Math.max(0, o.shipping) * share;
  const shippingCost = (shippingCharged * s.shippingCostPercent) / 100;
  const fees = feeValue * share;
  const commission = s.includeAffiliateCommissions ? Math.max(0, o.commission) * share : 0;
  const discounts = (o.couponDiscount + o.paymentDiscount + o.giftCard + o.points) * share;
  const profit = gross - taxes - refunds - shippingCost - fees - productCost - commission;
  return {
    order: o,
    date: orderDate(o, s.dateBasis),
    share,
    gross: round2(gross),
    taxes: round2(taxes),
    refunds: round2(refunds),
    shippingCharged: round2(shippingCharged),
    shippingCost: round2(shippingCost),
    fees: round2(fees),
    productCost: round2(productCost),
    missingCostValue: round2(missingCostValue),
    commission: round2(commission),
    discounts: round2(discounts),
    units: chosen.reduce((t, i) => t + i.quantity, 0),
    profit: round2(profit),
  };
}

/* ---------------------------------------------------------------------------------- */
/* Lançamentos manuais                                                                 */
/* ---------------------------------------------------------------------------------- */

export type EntryKind = 'expense' | 'income';
export type EntryStatus = 'paid' | 'pending';

export type FinEntry = {
  id: string;
  kind: EntryKind;
  categoryId: string | null;
  description: string;
  /** Valor na moeda base (já convertido). null = moeda sem taxa de câmbio. */
  amount: number | null;
  /** Data do lançamento (YYYY-MM-DD): quando foi pago ou recebido. */
  occurredOn: string;
  /** Vencimento (YYYY-MM-DD) para o que está por pagar ou receber. */
  dueOn: string | null;
  status: EntryStatus;
};

/** Valor em centavos de outra moeda para a moeda base (1 base = rates[código]). null = sem taxa. */
export function toBaseAmount(cents: number, currency: string, base: string, rates: Record<string, number>, digits = 2): number | null {
  const value = cents / 10 ** digits;
  if (currency === base) return round2(value);
  const r = rates[currency];
  return r && r > 0 ? round2(value / r) : null;
}

/** Datas (YYYY-MM-DD) de um lançamento repetido todo mês; o dia 31 vira o último dia dos meses curtos. */
export function monthlyDates(start: string, times: number): string[] {
  const [y, m, d] = start.split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < Math.max(1, Math.min(60, times)); i++) {
    const last = new Date(Date.UTC(y, m - 1 + i + 1, 0)).getUTCDate();
    const dt = new Date(Date.UTC(y, m - 1 + i, Math.min(d, last)));
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}

/** Data local do lançamento (meia-noite do dia, no fuso do navegador). */
export const entryDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** O lançamento por pagar já venceu? */
export const isOverdue = (e: Pick<FinEntry, 'status' | 'dueOn' | 'occurredOn'>, now = new Date()) => {
  if (e.status !== 'pending') return false;
  const d = entryDate(e.dueOn ?? e.occurredOn);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return d < today;
};

/* ---------------------------------------------------------------------------------- */
/* Períodos                                                                            */
/* ---------------------------------------------------------------------------------- */

export type PeriodPreset = 'month' | 'last_month' | '30d' | '90d' | 'year' | '12m' | 'all' | 'custom';
export const PERIOD_PRESETS: PeriodPreset[] = ['month', 'last_month', '30d', '90d', 'year', '12m', 'all', 'custom'];
export type CompareMode = 'previous' | 'year' | 'none';

/** Intervalo [from, to) em datas locais. */
export type Range = { from: Date; to: Date };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Intervalo de um período. custom = datas YYYY-MM-DD (fim inclusive). all = desde `first` (ou 1 ano). */
export function presetRange(p: PeriodPreset, now = new Date(), custom?: { from?: string | null; to?: string | null }, first?: Date | null): Range {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  switch (p) {
    case 'month': return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: tomorrow };
    case 'last_month': return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1) };
    case '30d': return { from: addDays(today, -29), to: tomorrow };
    case '90d': return { from: addDays(today, -89), to: tomorrow };
    case 'year': return { from: new Date(now.getFullYear(), 0, 1), to: tomorrow };
    case '12m': return { from: new Date(now.getFullYear(), now.getMonth() - 11, 1), to: tomorrow };
    case 'all': {
      const f = first ? new Date(first.getFullYear(), first.getMonth(), 1) : new Date(now.getFullYear() - 1, now.getMonth(), 1);
      return { from: f, to: tomorrow };
    }
    case 'custom': {
      const from = custom?.from && /^\d{4}-\d{2}-\d{2}$/.test(custom.from) ? entryDate(custom.from) : addDays(today, -29);
      const toIncl = custom?.to && /^\d{4}-\d{2}-\d{2}$/.test(custom.to) ? entryDate(custom.to) : today;
      return toIncl < from ? { from: toIncl, to: addDays(from, 1) } : { from, to: addDays(toIncl, 1) };
    }
  }
}

/** Período de comparação: o anterior do mesmo tamanho ou o mesmo intervalo um ano antes. */
export function compareRange(r: Range, mode: CompareMode): Range | null {
  if (mode === 'none') return null;
  if (mode === 'year') {
    const shift = (d: Date) => new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());
    return { from: shift(r.from), to: shift(r.to) };
  }
  // Meses inteiros comparam com os meses inteiros anteriores (fevereiro com janeiro, não com 28 dias).
  const wholeMonths = r.from.getDate() === 1 && r.to.getDate() === 1;
  if (wholeMonths) {
    const months = (r.to.getFullYear() - r.from.getFullYear()) * 12 + r.to.getMonth() - r.from.getMonth();
    return { from: new Date(r.from.getFullYear(), r.from.getMonth() - months, 1), to: new Date(r.from) };
  }
  const days = Math.round((+r.to - +r.from) / 86_400_000);
  return { from: addDays(r.from, -days), to: new Date(r.from) };
}

export const inRange = (iso: string, r: Range) => {
  const t = iso.length === 10 ? +entryDate(iso) : +new Date(iso);
  return t >= +r.from && t < +r.to;
};

/* ---------------------------------------------------------------------------------- */
/* Somas                                                                               */
/* ---------------------------------------------------------------------------------- */

export type FinanceSummary = {
  orders: number;
  units: number;
  gross: number;
  taxes: number;
  refunds: number;
  net: number;
  shippingCharged: number;
  shippingCost: number;
  fees: number;
  productCost: number;
  missingCostValue: number;
  commission: number;
  discounts: number;
  /** Lucro só dos pedidos. */
  salesProfit: number;
  expenses: number;
  otherIncome: number;
  /** Tudo o que saiu: impostos, reembolsos, frete, taxas, custo, comissões e despesas. */
  costs: number;
  profit: number;
  /** Lucro sobre o faturamento (0 a 1). null sem faturamento. */
  margin: number | null;
  avgTicket: number;
  /** Ainda por pagar e por receber (lançamentos pendentes do período). */
  toPay: number;
  toReceive: number;
};

export function summarize(rows: FinRow[], entries: FinEntry[] = []): FinanceSummary {
  const s = (f: (r: FinRow) => number) => round2(rows.reduce((t, r) => t + f(r), 0));
  const e = (kind: EntryKind, status: EntryStatus) =>
    round2(entries.filter((x) => x.kind === kind && x.status === status).reduce((t, x) => t + (x.amount ?? 0), 0));
  const gross = s((r) => r.gross);
  const taxes = s((r) => r.taxes);
  const refunds = s((r) => r.refunds);
  const shippingCost = s((r) => r.shippingCost);
  const fees = s((r) => r.fees);
  const productCost = s((r) => r.productCost);
  const commission = s((r) => r.commission);
  const salesProfit = s((r) => r.profit);
  const expenses = e('expense', 'paid');
  const otherIncome = e('income', 'paid');
  const orders = rows.filter((r) => r.share > 0).length;
  const profit = round2(salesProfit - expenses + otherIncome);
  return {
    orders,
    units: rows.reduce((t, r) => t + r.units, 0),
    gross,
    taxes,
    refunds,
    net: round2(gross - taxes - refunds),
    shippingCharged: s((r) => r.shippingCharged),
    shippingCost,
    fees,
    productCost,
    missingCostValue: s((r) => r.missingCostValue),
    commission,
    discounts: s((r) => r.discounts),
    salesProfit,
    expenses,
    otherIncome,
    costs: round2(taxes + refunds + shippingCost + fees + productCost + commission + expenses),
    profit,
    margin: gross + otherIncome > 0 ? profit / (gross + otherIncome) : null,
    avgTicket: orders ? round2(gross / orders) : 0,
    toPay: e('expense', 'pending'),
    toReceive: e('income', 'pending'),
  };
}

/** Variação em relação ao período de comparação (0,12 = +12%). null sem base. */
export const delta = (current: number, previous: number | null | undefined) =>
  previous == null || previous === 0 ? null : (current - previous) / Math.abs(previous);

/** Passos de "Para onde vai o dinheiro": do faturamento ao lucro. */
export type WaterfallStep = { key: string; value: number; start: number; end: number; kind: 'total' | 'minus' | 'plus' | 'result' };

export function waterfall(s: FinanceSummary): WaterfallStep[] {
  const steps: WaterfallStep[] = [];
  let level = s.gross;
  steps.push({ key: 'gross', value: s.gross, start: 0, end: s.gross, kind: 'total' });
  const minus = (key: string, v: number) => {
    if (!v) return;
    steps.push({ key, value: -v, start: level, end: level - v, kind: 'minus' });
    level -= v;
  };
  minus('taxes', s.taxes);
  minus('refunds', s.refunds);
  minus('productCost', s.productCost);
  minus('shippingCost', s.shippingCost);
  minus('fees', s.fees);
  minus('commission', s.commission);
  minus('expenses', s.expenses);
  if (s.otherIncome) {
    steps.push({ key: 'otherIncome', value: s.otherIncome, start: level, end: level + s.otherIncome, kind: 'plus' });
    level += s.otherIncome;
  }
  steps.push({ key: 'profit', value: round2(level), start: 0, end: round2(level), kind: 'result' });
  return steps.map((x) => ({ ...x, start: round2(x.start), end: round2(x.end), value: round2(x.value) }));
}

/* ---------------------------------------------------------------------------------- */
/* Séries no tempo                                                                     */
/* ---------------------------------------------------------------------------------- */

export type Grain = 'day' | 'week' | 'month';

/** Dia (até 45 dias), semana (até 200 dias) ou mês. */
export function autoGrain(r: Range): Grain {
  const days = (+r.to - +r.from) / 86_400_000;
  return days <= 45 ? 'day' : days <= 200 ? 'week' : 'month';
}

const weekStart = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const bucketStart = (d: Date, g: Grain) => (g === 'month' ? new Date(d.getFullYear(), d.getMonth(), 1) : g === 'week' ? weekStart(d) : startOfDay(d));
const nextBucket = (d: Date, g: Grain) => (g === 'month' ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : addDays(d, g === 'week' ? 7 : 1));

export type SeriesPoint = { index: number; start: string; revenue: number; costs: number; profit: number; orders: number };

/** Faturamento, custos (todos, com despesas) e lucro por dia / semana / mês do intervalo, sem buracos. */
export function financeSeries(rows: FinRow[], entries: FinEntry[], r: Range, g: Grain): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  const index = new Map<number, SeriesPoint>();
  for (let c = bucketStart(r.from, g), i = 0; c < r.to; c = nextBucket(c, g), i++) {
    const p = { index: i, start: c.toISOString(), revenue: 0, costs: 0, profit: 0, orders: 0 };
    points.push(p);
    index.set(+c, p);
  }
  const at = (d: Date) => index.get(+bucketStart(d, g));
  for (const row of rows) {
    const p = at(new Date(row.date));
    if (!p) continue;
    p.revenue += row.gross;
    p.costs += row.gross - row.profit;
    p.profit += row.profit;
    if (row.share > 0) p.orders += 1;
  }
  for (const e of entries) {
    if (e.status !== 'paid' || e.amount == null) continue;
    const p = at(entryDate(e.occurredOn));
    if (!p) continue;
    if (e.kind === 'expense') { p.costs += e.amount; p.profit -= e.amount; } else { p.revenue += e.amount; p.profit += e.amount; }
  }
  return points.map((p) => ({ ...p, revenue: round2(p.revenue), costs: round2(p.costs), profit: round2(p.profit) }));
}

/** Fluxo de caixa por mês: entradas, saídas, saldo do mês e acumulado. */
export type CashMonth = { month: string; inflow: number; outflow: number; balance: number; cumulative: number };

export function cashFlow(rows: FinRow[], entries: FinEntry[], r: Range): CashMonth[] {
  const pts = financeSeries(rows, entries, r, 'month');
  let acc = 0;
  return pts.map((p) => {
    const balance = round2(p.revenue - p.costs);
    acc = round2(acc + balance);
    return { month: p.start, inflow: p.revenue, outflow: p.costs, balance, cumulative: acc };
  });
}

/* ---------------------------------------------------------------------------------- */
/* Divisões                                                                            */
/* ---------------------------------------------------------------------------------- */

export type SplitRow = { key: string; gross: number; profit: number; orders: number; share: number };

/** Faturamento e lucro agrupados (meio de pagamento, país, cliente...). share = parte do faturamento. */
export function splitBy(rows: FinRow[], keyOf: (r: FinRow) => string | null | undefined): SplitRow[] {
  const total = rows.reduce((t, r) => t + r.gross, 0);
  const map = new Map<string, { gross: number; profit: number; orders: number }>();
  for (const r of rows) {
    if (r.share <= 0) continue;
    const k = keyOf(r) || '';
    const cur = map.get(k) ?? { gross: 0, profit: 0, orders: 0 };
    cur.gross += r.gross;
    cur.profit += r.profit;
    cur.orders += 1;
    map.set(k, cur);
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, gross: round2(v.gross), profit: round2(v.profit), orders: v.orders, share: total ? v.gross / total : 0 }))
    .sort((a, b) => b.gross - a.gross);
}

export type ProductSplit = { productId: string; units: number; revenue: number; cost: number | null; profit: number | null };

/** Receita (valor dos itens) e lucro bruto por produto, só dos itens que o filtro deixa. */
export function productSplit(rows: FinRow[], itemFilter?: (i: FinItem) => boolean): ProductSplit[] {
  const map = new Map<string, { units: number; revenue: number; cost: number; known: boolean }>();
  for (const r of rows) {
    for (const i of r.order.items) {
      if (itemFilter && !itemFilter(i)) continue;
      const cur = map.get(i.productId) ?? { units: 0, revenue: 0, cost: 0, known: true };
      cur.units += i.quantity;
      cur.revenue += i.price * i.quantity;
      if (i.unitCost == null) cur.known = false; else cur.cost += i.unitCost * i.quantity;
      map.set(i.productId, cur);
    }
  }
  return [...map.entries()].map(([productId, v]) => ({
    productId, units: v.units, revenue: round2(v.revenue),
    cost: v.known ? round2(v.cost) : null, profit: v.known ? round2(v.revenue - v.cost) : null,
  })).sort((a, b) => b.revenue - a.revenue);
}

/** Despesas (ou entradas) pagas por categoria. */
export function entrySplit(entries: FinEntry[], kind: EntryKind): { key: string; amount: number; count: number; share: number }[] {
  const list = entries.filter((e) => e.kind === kind && e.status === 'paid' && e.amount != null);
  const total = list.reduce((t, e) => t + (e.amount ?? 0), 0);
  const map = new Map<string, { amount: number; count: number }>();
  for (const e of list) {
    const k = e.categoryId ?? '';
    const cur = map.get(k) ?? { amount: 0, count: 0 };
    cur.amount += e.amount ?? 0;
    cur.count += 1;
    map.set(k, cur);
  }
  return [...map.entries()].map(([key, v]) => ({ key, amount: round2(v.amount), count: v.count, share: total ? v.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

/** Meta do mês: quanto falta e em que ritmo, para o mês do `now`. */
export function goalProgress(goal: number | null, monthRevenue: number, now = new Date()) {
  if (!goal) return null;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const day = now.getDate();
  const projected = round2((monthRevenue / day) * daysInMonth);
  return { goal, done: monthRevenue, ratio: monthRevenue / goal, projected, onTrack: projected >= goal };
}

/* ---------------------------------------------------------------------------------- */
/* Categorias padrão                                                                   */
/* ---------------------------------------------------------------------------------- */

/** Códigos das categorias criadas com a loja (o nome vem do i18n, cat_<código>; o dono pode renomear). */
export const DEFAULT_CATEGORY_CODES: { code: string; kind: EntryKind }[] = [
  { code: 'materials', kind: 'expense' },
  { code: 'packaging', kind: 'expense' },
  { code: 'shipping', kind: 'expense' },
  { code: 'marketing', kind: 'expense' },
  { code: 'software', kind: 'expense' },
  { code: 'rent', kind: 'expense' },
  { code: 'salaries', kind: 'expense' },
  { code: 'taxes', kind: 'expense' },
  { code: 'equipment', kind: 'expense' },
  { code: 'fees', kind: 'expense' },
  { code: 'other_expense', kind: 'expense' },
  { code: 'services', kind: 'income' },
  { code: 'investment', kind: 'income' },
  { code: 'other_income', kind: 'income' },
];
