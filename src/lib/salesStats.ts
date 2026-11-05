// =====================================================================================
// Estatísticas de vendas para as páginas de detalhe do Admin (produto e categoria).
// Funções puras sobre linhas de pedido; as consultas ficam em src/hooks/useSalesStats.ts.
//
//   Vendido     pagamento confirmado e pedido não cancelado nem reembolsado
//   Pendente    pedido aberto ainda sem pagamento confirmado
//   Cancelado   pedido cancelado ou reembolsado
// Valores = preço unitário gravado no item x quantidade (valor dos produtos, sem frete), na moeda base da loja.
// Teste: node --experimental-strip-types scripts/test-sales-stats.mjs
// =====================================================================================

export type SaleLine = {
  orderId: string;
  createdAt: string;
  status: string;
  paymentStatus: string | null;
  userId: string | null;
  customerName: string;
  country: string | null;
  productId: string;
  quantity: number;
  price: number;
  variation: string | null;
  size: string | null;
  couponCode: string | null;
};

export type SalePeriod = "30d" | "90d" | "12m" | "all";

const DAY = 86_400_000;
const CANCELLED = new Set(["cancelled", "refunded"]);

export const isCancelled = (l: Pick<SaleLine, "status">) => CANCELLED.has(l.status);
export const isSold = (l: Pick<SaleLine, "status" | "paymentStatus">) => l.paymentStatus === "paid" && !isCancelled(l);
export const isPending = (l: Pick<SaleLine, "status" | "paymentStatus">) => !isSold(l) && !isCancelled(l);
const value = (l: SaleLine) => l.price * l.quantity;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Início do período (inclusive). "all" = sem limite. */
export function periodStart(period: SalePeriod, now = new Date()): Date | null {
  if (period === "all") return null;
  if (period === "12m") return new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (period === "30d" ? 29 : 89));
  return d;
}

export const inPeriod = <T extends Pick<SaleLine, "createdAt">>(lines: T[], period: SalePeriod, now = new Date()): T[] => {
  const start = periodStart(period, now);
  return start ? lines.filter((l) => new Date(l.createdAt) >= start) : lines;
};

export type SalesSummary = {
  revenue: number;
  units: number;
  orders: number;
  customers: number;
  avgPrice: number;
  avgPerOrder: number;
  pendingUnits: number;
  pendingRevenue: number;
  cancelledUnits: number;
  /** Unidades canceladas sobre todas as unidades pedidas (0 a 1). */
  cancelRate: number;
  firstSale: string | null;
  lastSale: string | null;
};

export function summarize(lines: SaleLine[]): SalesSummary {
  const sold = lines.filter(isSold);
  const pending = lines.filter(isPending);
  const cancelled = lines.filter(isCancelled);
  const revenue = sold.reduce((s, l) => s + value(l), 0);
  const units = sold.reduce((s, l) => s + l.quantity, 0);
  const orders = new Set(sold.map((l) => l.orderId)).size;
  const customers = new Set(sold.map((l) => l.userId || `guest:${l.customerName.toLowerCase()}`)).size;
  const cancelledUnits = cancelled.reduce((s, l) => s + l.quantity, 0);
  const allUnits = lines.reduce((s, l) => s + l.quantity, 0);
  const dates = sold.map((l) => l.createdAt).sort();
  return {
    revenue: round2(revenue),
    units,
    orders,
    customers,
    avgPrice: units ? round2(revenue / units) : 0,
    avgPerOrder: orders ? round2(revenue / orders) : 0,
    pendingUnits: pending.reduce((s, l) => s + l.quantity, 0),
    pendingRevenue: round2(pending.reduce((s, l) => s + value(l), 0)),
    cancelledUnits,
    cancelRate: allUnits ? cancelledUnits / allUnits : 0,
    firstSale: dates[0] ?? null,
    lastSale: dates[dates.length - 1] ?? null,
  };
}

/** Receita vendida nos últimos `days` dias contra os `days` anteriores. deltaPct = null sem base de comparação. */
export function compareWindows(lines: SaleLine[], days: number, now = new Date()) {
  const end = now.getTime();
  const sum = (from: number, to: number) =>
    round2(lines.filter((l) => isSold(l) && +new Date(l.createdAt) > from && +new Date(l.createdAt) <= to).reduce((s, l) => s + value(l), 0));
  const current = sum(end - days * DAY, end);
  const previous = sum(end - 2 * days * DAY, end - days * DAY);
  return { current, previous, deltaPct: previous > 0 ? (current - previous) / previous : null };
}

export type Bucket = { key: string; start: string; unit: "day" | "week" | "month"; revenue: number; units: number };

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const weekStart = (d: Date) => {
  const w = new Date(d);
  w.setHours(0, 0, 0, 0);
  w.setDate(w.getDate() - ((w.getDay() + 6) % 7)); // segunda-feira
  return w;
};

/** Vendas por dia (30 dias), semana (90 dias) ou mês (12 meses e tudo), com os intervalos vazios preenchidos. */
export function timeSeries(lines: SaleLine[], period: SalePeriod, now = new Date()): Bucket[] {
  const sold = lines.filter(isSold);
  const unit: Bucket["unit"] = period === "30d" ? "day" : period === "90d" ? "week" : "month";
  let start = periodStart(period, now);
  if (!start) {
    const first = sold.map((l) => new Date(l.createdAt)).sort((a, b) => +a - +b)[0];
    start = first ? new Date(first.getFullYear(), first.getMonth(), 1) : new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const buckets: Bucket[] = [];
  const index = new Map<string, Bucket>();
  const cursor = unit === "week" ? weekStart(start) : unit === "month" ? new Date(start.getFullYear(), start.getMonth(), 1) : new Date(start);
  while (cursor <= now) {
    const key = unit === "month" ? monthKey(cursor) : dayKey(cursor);
    const b: Bucket = { key, start: cursor.toISOString(), unit, revenue: 0, units: 0 };
    buckets.push(b);
    index.set(key, b);
    if (unit === "day") cursor.setDate(cursor.getDate() + 1);
    else if (unit === "week") cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  for (const l of sold) {
    const d = new Date(l.createdAt);
    const key = unit === "month" ? monthKey(d) : unit === "week" ? dayKey(weekStart(d)) : dayKey(d);
    const b = index.get(key);
    if (!b) continue;
    b.revenue = round2(b.revenue + value(l));
    b.units += l.quantity;
  }
  return buckets;
}

export type BreakdownRow = { key: string; units: number; revenue: number; orders: number; share: number };

/** Vendido agrupado por uma chave (variação, tamanho, país, produto...); share = parte da receita (0 a 1). */
export function breakdown(lines: SaleLine[], keyOf: (l: SaleLine) => string | null | undefined): BreakdownRow[] {
  const sold = lines.filter(isSold);
  const total = sold.reduce((s, l) => s + value(l), 0);
  const map = new Map<string, { units: number; revenue: number; orders: Set<string> }>();
  for (const l of sold) {
    const k = keyOf(l);
    if (!k) continue;
    const cur = map.get(k) ?? { units: 0, revenue: 0, orders: new Set<string>() };
    cur.units += l.quantity;
    cur.revenue += value(l);
    cur.orders.add(l.orderId);
    map.set(k, cur);
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, units: v.units, revenue: round2(v.revenue), orders: v.orders.size, share: total ? v.revenue / total : 0 }))
    .sort((a, b) => b.revenue - a.revenue || b.units - a.units);
}

export type TopCustomer = { userId: string | null; name: string; units: number; revenue: number; orders: number; lastAt: string };

export function topCustomers(lines: SaleLine[], limit = 5): TopCustomer[] {
  const map = new Map<string, TopCustomer & { ids: Set<string> }>();
  for (const l of lines.filter(isSold)) {
    const k = l.userId || `guest:${l.customerName.toLowerCase()}`;
    const cur = map.get(k) ?? { userId: l.userId, name: l.customerName, units: 0, revenue: 0, orders: 0, lastAt: l.createdAt, ids: new Set<string>() };
    cur.units += l.quantity;
    cur.revenue = round2(cur.revenue + value(l));
    cur.ids.add(l.orderId);
    cur.orders = cur.ids.size;
    if (l.createdAt > cur.lastAt) cur.lastAt = l.createdAt;
    map.set(k, cur);
  }
  return [...map.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
    .map(({ ids: _ids, ...c }) => c);
}

/** Pedidos (um por linha, o mais recente primeiro) com a quantidade e o valor deste conjunto de produtos. */
export function recentOrders(lines: SaleLine[], limit = 10) {
  const map = new Map<string, { orderId: string; createdAt: string; status: string; paymentStatus: string | null; customerName: string; userId: string | null; units: number; value: number }>();
  for (const l of lines) {
    const cur = map.get(l.orderId) ?? { orderId: l.orderId, createdAt: l.createdAt, status: l.status, paymentStatus: l.paymentStatus, customerName: l.customerName, userId: l.userId, units: 0, value: 0 };
    cur.units += l.quantity;
    cur.value = round2(cur.value + value(l));
    map.set(l.orderId, cur);
  }
  return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

/** Vendas médias por dia nos últimos 30 dias e quantos dias o estoque atual dura nesse ritmo (null = sem vendas ou sem controle). */
export function stockCoverage(lines: SaleLine[], stock: number | null | undefined, now = new Date()) {
  const from = now.getTime() - 30 * DAY;
  const units = lines.filter((l) => isSold(l) && +new Date(l.createdAt) > from).reduce((s, l) => s + l.quantity, 0);
  const perDay = units / 30;
  return { perDay, days: stock != null && perDay > 0 ? Math.floor(stock / perDay) : null };
}
