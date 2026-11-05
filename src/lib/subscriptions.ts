// =====================================================================================
// Assinaturas (recurso subscriptions; Admin > Vendas > Assinaturas). Este ficheiro é igual a
// supabase/functions/_shared/subscriptions.ts (o teste scripts/test-subscriptions.mjs confere): o site mostra o preço
// e as datas, o servidor (priceItems no create-order) aplica o mesmo desconto.
//   Plano       por produto (product_subscription_plans): a cada N semanas ou meses, com desconto e mínimo de ciclos.
//   Assinatura  nasce do pedido com a linha design_data.subscription.plan_id; cada renovação é um pedido novo que o
//               cliente faz pela conta (design_data.subscription.subscription_id), pago como qualquer pedido.
//   Renovar     liberado a partir de renew_days_before dias antes da próxima data, com a assinatura ativa ou pausada.
// Datas sem hora (AAAA-MM-DD). Sem imports.
// =====================================================================================

export type IntervalUnit = 'week' | 'month';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';
export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ['active', 'paused', 'cancelled'];

export type SubscriptionPlan = {
  id: string;
  product_id: string;
  interval_unit: IntervalUnit;
  interval_count: number;
  discount_percent: number;
  min_cycles: number;
  is_active: boolean;
  display_order: number;
};

export type SubscriptionSettings = {
  /** O cliente pode pausar, retomar e pular um ciclo pela conta. */
  customer_pause: boolean;
  /** O cliente pode cancelar pela conta (depois do mínimo de ciclos do plano). */
  customer_cancel: boolean;
  /** Dias antes da próxima data em que o botão Renovar aparece. */
  renew_days_before: number;
};

export const DEFAULT_SUBSCRIPTION_SETTINGS: SubscriptionSettings = { customer_pause: true, customer_cancel: true, renew_days_before: 3 };
export const MAX_DISCOUNT = 90;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const int = (v: unknown, min: number, max: number, def: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeSubscriptionSettings(raw: unknown): SubscriptionSettings {
  const o = obj(raw);
  return {
    customer_pause: o.customer_pause !== false,
    customer_cancel: o.customer_cancel !== false,
    renew_days_before: int(o.renew_days_before, 0, 30, DEFAULT_SUBSCRIPTION_SETTINGS.renew_days_before),
  };
}

export function normalizePlan(raw: unknown): SubscriptionPlan {
  const o = obj(raw);
  const pct = Number(o.discount_percent);
  return {
    id: String(o.id ?? ''),
    product_id: String(o.product_id ?? ''),
    interval_unit: o.interval_unit === 'week' ? 'week' : 'month',
    interval_count: int(o.interval_count, 1, 52, 1),
    discount_percent: Number.isFinite(pct) ? Math.min(MAX_DISCOUNT, Math.max(0, Math.round(pct * 100) / 100)) : 0,
    min_cycles: int(o.min_cycles, 0, 60, 0),
    is_active: o.is_active !== false,
    display_order: int(o.display_order, -1e6, 1e6, 0),
  };
}

/** Planos ativos do produto, pela ordem e depois pelo intervalo mais curto. */
export const activePlans = (plans: SubscriptionPlan[], productId: string) =>
  plans.filter((p) => p.is_active && p.product_id === productId)
    .sort((a, b) => a.display_order - b.display_order || intervalDays(a) - intervalDays(b));

const intervalDays = (p: { interval_unit: IntervalUnit; interval_count: number }) => p.interval_count * (p.interval_unit === 'week' ? 7 : 30);

/** Preço unitário com o desconto da assinatura (o mesmo arredondamento do servidor: sem arredondar aqui). */
export const subscriptionUnit = (unit: number, pct: number) => Math.max(0, unit * (1 - Math.min(MAX_DISCOUNT, Math.max(0, Number(pct) || 0)) / 100));

const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const fromDate = (d: Date) => d.toISOString().slice(0, 10);

/** Data + intervalo (meses mantêm o dia; 31 vira o último dia do mês mais curto). Igual a public.subscription_add_interval. */
export function addInterval(date: string, unit: IntervalUnit, count: number): string {
  const d = toDate(date);
  if (unit === 'week') {
    d.setUTCDate(d.getUTCDate() + 7 * count);
    return fromDate(d);
  }
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + count, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return fromDate(target);
}

/** Próxima data depois de uma renovação: conta a partir da data prevista, ou de hoje se já passou. */
export const nextAfterRenewal = (nextDate: string, today: string, unit: IntervalUnit, count: number) =>
  addInterval(nextDate > today ? nextDate : today, unit, count);

/** A renovação já pode ser feita? */
export function renewalOpen(sub: { status: string; next_date: string | null }, today: string, s: SubscriptionSettings): boolean {
  if (sub.status === 'cancelled' || !sub.next_date || !DATE_RE.test(sub.next_date)) return false;
  const opensOn = addDays(sub.next_date, -s.renew_days_before);
  return today >= opensOn;
}

/** Renovação atrasada (passou da data e não foi feita). */
export const renewalLate = (sub: { status: string; next_date: string | null }, today: string) =>
  sub.status === 'active' && !!sub.next_date && sub.next_date < today;

export function addDays(date: string, n: number): string {
  const d = toDate(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDate(d);
}

/** O cliente pode cancelar? (ligado nas regras e já cumpriu o mínimo de ciclos do plano) */
export const canCustomerCancel = (sub: { status: string; cycles_done: number; min_cycles: number }, s: SubscriptionSettings) =>
  s.customer_cancel && sub.status !== 'cancelled' && sub.cycles_done >= sub.min_cycles;

/** Valor por mês (para a receita recorrente estimada no Admin). */
export function monthlyValue(unitTotal: number, unit: IntervalUnit, count: number): number {
  const months = unit === 'week' ? (7 * count) / 30.4375 : count;
  return months > 0 ? unitTotal / months : 0;
}
