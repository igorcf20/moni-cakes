// Centralized badge styles for order status & payment status.
// Ensures WCAG-AA contrast in both light and dark themes.
// Rótulos traduzidos em src/i18n/orders.ts: o site usa orderStatusLabel / paymentStatusLabel / paymentMethodLabel
// com a locale atual; o painel Admin continua com os rótulos pt-BR de orderStatusStyle e paymentStatusStyle.
import { DEFAULT_LOCALE, type Locale } from "@/i18n";
import { ordersMessages, type OrdersKey } from "@/i18n/orders";

export type OrderStatusKey =
  | "pending"
  | "paid"
  | "preparing"
  | "ready_for_pickup"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

/** Todos os estados de pedido que a base grava (o Admin só oferece os de OrderStatusKey). */
export type OrderStatus = OrderStatusKey | "awaiting_payment" | "completed";

export type PaymentStatusKey =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "refunded"
  | "cancelled";

// Nomes antigos ou alternativos do mesmo estado (dados da loja anterior e notifyOrderEmail).
const ORDER_STATUS_ALIAS: Record<string, OrderStatus> = { in_production: "preparing", processing: "preparing" };

const has = (k: string): k is OrdersKey => Object.prototype.hasOwnProperty.call(ordersMessages[DEFAULT_LOCALE], k);

const msg = (key: OrdersKey, locale: Locale = DEFAULT_LOCALE): string =>
  (ordersMessages[locale] ?? ordersMessages[DEFAULT_LOCALE])[key] ?? ordersMessages[DEFAULT_LOCALE][key];

/** Estado canónico (resolve aliases como in_production e processing para preparing). */
export const normalizeOrderStatus = (status: string | null | undefined): string => {
  const s = String(status ?? "").trim();
  return ORDER_STATUS_ALIAS[s] ?? s;
};

/** Rótulo do estado do pedido no idioma pedido; estados desconhecidos voltam como vieram. */
export function orderStatusLabel(status: string | null | undefined, locale: Locale = DEFAULT_LOCALE): string {
  const s = normalizeOrderStatus(status);
  const k = `status_${s}`;
  return has(k) ? msg(k, locale) : s;
}

/** Rótulo do estado do pagamento no idioma pedido; estados desconhecidos voltam como vieram. */
export function paymentStatusLabel(status: string | null | undefined, locale: Locale = DEFAULT_LOCALE): string {
  const s = String(status ?? "").trim();
  const k = `payStatus_${s}`;
  return has(k) ? msg(k, locale) : s;
}

/** Rótulo do meio de pagamento no idioma pedido; meios desconhecidos voltam como vieram. */
export function paymentMethodLabel(method: string | null | undefined, locale: Locale = DEFAULT_LOCALE): string {
  const m = String(method ?? "").trim();
  const k = `pay_${m}`;
  return has(k) ? msg(k, locale) : m;
}

const ORDER_BADGES: Record<OrderStatusKey, { badge: string; dot: string }> = {
  pending:   { badge: "bg-amber-400 text-slate-900 border-amber-500 hover:bg-amber-400", dot: "bg-amber-400" },
  paid:      { badge: "bg-sky-600 text-white border-sky-700 hover:bg-sky-600",          dot: "bg-sky-600" },
  preparing: { badge: "bg-violet-600 text-white border-violet-700 hover:bg-violet-600", dot: "bg-violet-600" },
  ready_for_pickup: { badge: "bg-teal-600 text-white border-teal-700 hover:bg-teal-600", dot: "bg-teal-600" },
  shipped:   { badge: "bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-600", dot: "bg-indigo-600" },
  delivered: { badge: "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-600", dot: "bg-emerald-600" },
  cancelled: { badge: "bg-rose-600 text-white border-rose-700 hover:bg-rose-600",       dot: "bg-rose-600" },
  refunded:  { badge: "bg-slate-500 text-white border-slate-600 hover:bg-slate-500",    dot: "bg-slate-500" },
};

// Estados gravados pela base que o Admin não oferece na lista: usam a cor do estado equivalente.
const ORDER_BADGE_ALIAS: Record<string, OrderStatusKey> = { awaiting_payment: "pending", completed: "delivered" };

const PAYMENT_BADGES: Record<PaymentStatusKey, string> = {
  pending:    "bg-amber-400 text-slate-900 border-amber-500 hover:bg-amber-400",
  processing: "bg-sky-500 text-white border-sky-600 hover:bg-sky-500",
  paid:       "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-600",
  failed:     "bg-rose-600 text-white border-rose-700 hover:bg-rose-600",
  refunded:   "bg-slate-500 text-white border-slate-600 hover:bg-slate-500",
  cancelled:  "bg-zinc-600 text-white border-zinc-700 hover:bg-zinc-600",
};

const mapValues = <K extends string, V, R>(obj: Record<K, V>, fn: (v: V, k: K) => R): Record<K, R> =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v as V, k as K)])) as Record<K, R>;

/** Estilos e rótulos pt-BR dos estados que o Admin oferece (lista e filtros). */
export const orderStatusStyle: Record<OrderStatusKey, { label: string; badge: string; dot: string }> =
  mapValues(ORDER_BADGES, (v, k) => ({ label: orderStatusLabel(k), ...v }));

/** Estilos e rótulos pt-BR dos estados do pagamento (Admin). */
export const paymentStatusStyle: Record<PaymentStatusKey, { label: string; badge: string }> =
  mapValues(PAYMENT_BADGES, (badge, k) => ({ label: paymentStatusLabel(k), badge }));

/** Estilo do estado do pedido; com locale, o rótulo vem nesse idioma (padrão pt-BR, como no Admin). */
export const getOrderStatusStyle = (key: string, locale: Locale = DEFAULT_LOCALE) => {
  const s = normalizeOrderStatus(key);
  const styleKey = (ORDER_BADGE_ALIAS[s] ?? s) as OrderStatusKey;
  const style = (Object.prototype.hasOwnProperty.call(ORDER_BADGES, styleKey) && ORDER_BADGES[styleKey]) || { badge: "bg-slate-500 text-white border-slate-600", dot: "bg-slate-500" };
  return { label: orderStatusLabel(s, locale), ...style };
};

/** Estilo do estado do pagamento; estados desconhecidos usam o de pending (como antes). */
export const getPaymentStatusStyle = (key: string, locale: Locale = DEFAULT_LOCALE) => {
  const k = (Object.prototype.hasOwnProperty.call(PAYMENT_BADGES, key) ? key : "pending") as PaymentStatusKey;
  return { label: paymentStatusLabel(k, locale), badge: PAYMENT_BADGES[k] };
};
