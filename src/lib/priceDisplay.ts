// =====================================================================================
// Exibição de preços (recurso price_display): como o preço aparece na loja, como forma de marketing.
//   Desconto à vista   o desconto é o do meio de pagamento escolhido (Admin > Pagamentos, discount_percent),
//                      o mesmo que o create-order cobra (paymentDiscount em _shared/payments/methods.ts): o
//                      cliente vê o preço que paga. Sem o meio ativo no país, sem desconto ou abaixo do valor
//                      mínimo do meio, a linha some sozinha.
//   Parcelamento       só para mostrar (quem cobra é o provedor do cartão): parcelas máximas, quantas sem juros,
//                      juros ao mês (tabela Price) e valor mínimo da parcela, nos países escolhidos.
//   Onde               cada lugar (cartão do produto, página do produto, barra do celular, carrinho, checkout)
//                      tem o preço em destaque (cartão, à vista ou parcela) e o estilo (completo ou discreto).
// Regras em store_settings.price_display (Admin > Pagamentos e entrega > Exibição de preços, AdminPriceDisplay).
// Sem imports com @/ para o teste em node (scripts/test-price-display.mjs).
// =====================================================================================

export const PRICE_PLACES = ['product', 'card', 'buyBar', 'cart', 'checkout'] as const;
export type PricePlace = (typeof PRICE_PLACES)[number];

/** Preço em destaque: o do cartão (preço cheio), o à vista com desconto, ou a parcela ("3x de R$ 30"). */
export type PriceHighlight = 'card' | 'cash' | 'installment';
/** completo = linhas extras com destaque de cor e selo; discreto = uma linha pequena, em cinza. */
export type PriceStyle = 'full' | 'discreet';

export type PlaceSettings = { enabled: boolean; highlight: PriceHighlight; style: PriceStyle };

/** Texto ao lado do preço com desconto: pelo meio ("no Pix", "na transferência") ou "à vista". */
export type CashLabel = 'method' | 'cash';

export type PriceDisplaySettings = {
  cash: {
    enabled: boolean;
    /** Tipo do meio de pagamento cujo desconto se mostra (payment_config.type). */
    method: string;
    label: CashLabel;
    /** Selo "-5%" ao lado do preço à vista. */
    badge: boolean;
    /** Linha "Você economiza R$ X". */
    savings: boolean;
  };
  installments: {
    enabled: boolean;
    /** Parcelas no máximo (1 a 24). */
    max: number;
    /** Até quantas parcelas sem juros (0 = todas com juros). */
    interestFree: number;
    /** Juros ao mês, em %, para as parcelas acima das sem juros (0 = todas sem juros). */
    monthlyRate: number;
    /** Valor mínimo de cada parcela, na moeda base da loja (0 = sem mínimo). */
    minValue: number;
    /** Que parcela anunciar: a maior sem juros, ou a maior de todas (com juros, se houver). */
    show: 'free' | 'max';
    /** Tabela "Ver parcelas" na página do produto. */
    table: boolean;
    /** Países onde se mostra o parcelamento (vazio = todos). */
    countries: string[];
  };
  places: Record<PricePlace, PlaceSettings>;
};

export const DEFAULT_PRICE_DISPLAY: PriceDisplaySettings = {
  cash: { enabled: true, method: 'pix', label: 'method', badge: true, savings: false },
  installments: { enabled: false, max: 12, interestFree: 3, monthlyRate: 1.99, minValue: 5, show: 'free', table: true, countries: ['BR'] },
  places: {
    product: { enabled: true, highlight: 'card', style: 'full' },
    card: { enabled: true, highlight: 'card', style: 'discreet' },
    buyBar: { enabled: true, highlight: 'card', style: 'discreet' },
    cart: { enabled: true, highlight: 'card', style: 'full' },
    checkout: { enabled: false, highlight: 'card', style: 'discreet' },
  },
};

/** Modelos prontos do Admin (mudam só o destaque e o estilo de cada lugar). */
export const PRICE_PRESETS: Record<'card' | 'cash' | 'installment' | 'discreet', Record<PricePlace, PlaceSettings>> = {
  card: DEFAULT_PRICE_DISPLAY.places,
  cash: {
    product: { enabled: true, highlight: 'cash', style: 'full' },
    card: { enabled: true, highlight: 'cash', style: 'full' },
    buyBar: { enabled: true, highlight: 'cash', style: 'discreet' },
    cart: { enabled: true, highlight: 'cash', style: 'full' },
    checkout: { enabled: true, highlight: 'card', style: 'discreet' },
  },
  installment: {
    product: { enabled: true, highlight: 'installment', style: 'full' },
    card: { enabled: true, highlight: 'installment', style: 'full' },
    buyBar: { enabled: true, highlight: 'installment', style: 'discreet' },
    cart: { enabled: true, highlight: 'card', style: 'full' },
    checkout: { enabled: false, highlight: 'card', style: 'discreet' },
  },
  discreet: {
    product: { enabled: true, highlight: 'card', style: 'discreet' },
    card: { enabled: true, highlight: 'card', style: 'discreet' },
    buyBar: { enabled: false, highlight: 'card', style: 'discreet' },
    cart: { enabled: true, highlight: 'card', style: 'discreet' },
    checkout: { enabled: false, highlight: 'card', style: 'discreet' },
  },
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const num = (v: unknown, d: number, min: number, max: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

export function normalizePriceDisplay(raw: unknown): PriceDisplaySettings {
  const r = obj(raw);
  const c = obj(r.cash);
  const i = obj(r.installments);
  const p = obj(r.places);
  const d = DEFAULT_PRICE_DISPLAY;
  const max = Math.round(num(i.max, d.installments.max, 1, 24));
  const places = {} as Record<PricePlace, PlaceSettings>;
  for (const k of PRICE_PLACES) {
    const s = obj(p[k]);
    places[k] = {
      enabled: bool(s.enabled, d.places[k].enabled),
      highlight: pick(s.highlight, ['card', 'cash', 'installment'] as const, d.places[k].highlight),
      style: pick(s.style, ['full', 'discreet'] as const, d.places[k].style),
    };
  }
  const method = typeof c.method === 'string' && /^[a-z_]{2,40}$/.test(c.method) ? c.method : d.cash.method;
  const countries = Array.isArray(i.countries)
    ? [...new Set(i.countries.filter((x): x is string => typeof x === 'string' && /^[A-Za-z]{2}$/.test(x)).map((x) => x.toUpperCase()))]
    : d.installments.countries;
  return {
    cash: {
      enabled: bool(c.enabled, d.cash.enabled), method,
      label: pick(c.label, ['method', 'cash'] as const, d.cash.label),
      badge: bool(c.badge, d.cash.badge), savings: bool(c.savings, d.cash.savings),
    },
    installments: {
      enabled: bool(i.enabled, d.installments.enabled), max,
      interestFree: Math.min(max, Math.round(num(i.interestFree, d.installments.interestFree, 0, 24))),
      monthlyRate: Math.round(num(i.monthlyRate, d.installments.monthlyRate, 0, 20) * 100) / 100,
      minValue: Math.round(num(i.minValue, d.installments.minValue, 0, 1_000_000) * 100) / 100,
      show: pick(i.show, ['free', 'max'] as const, d.installments.show),
      table: bool(i.table, d.installments.table), countries,
    },
    places,
  };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Preço à vista: igual à conta do servidor (desconto de 0 a 50%, arredondado ao centavo). */
export function cashPrice(amount: number, pct: number): number {
  const p = Math.min(50, Math.max(0, pct || 0));
  if (!p || amount <= 0) return amount;
  return round2(amount - round2(amount * p / 100));
}

export type Installment = { n: number; value: number; total: number; free: boolean };

/**
 * Parcelas possíveis para um valor: 1 até max, sem juros até interestFree (ou todas, com juros 0), com juros
 * compostos ao mês (tabela Price) acima disso; para no primeiro número cuja parcela fica abaixo do mínimo.
 * A 1.ª parcela entra sempre (pagar à vista no cartão).
 */
export function installmentPlan(amount: number, s: PriceDisplaySettings['installments']): Installment[] {
  if (amount <= 0) return [];
  const out: Installment[] = [];
  const rate = s.monthlyRate / 100;
  for (let n = 1; n <= s.max; n++) {
    const free = n <= Math.max(1, s.interestFree) || rate <= 0;
    const value = free ? amount / n : (amount * rate) / (1 - Math.pow(1 + rate, -n));
    const v = round2(value);
    if (n > 1 && s.minValue > 0 && v + 1e-9 < s.minValue) break;
    out.push({ n, value: v, total: free ? round2(amount) : round2(v * n), free });
  }
  return out;
}

/** A parcela a anunciar (a maior sem juros, ou a maior de todas). null = só 1x (não vale anunciar). */
export function headlineInstallment(amount: number, s: PriceDisplaySettings['installments']): Installment | null {
  const plan = installmentPlan(amount, s);
  const list = s.show === 'free' ? plan.filter((x) => x.free) : plan;
  const best = list[list.length - 1];
  return best && best.n > 1 ? best : null;
}

/** Meio de pagamento lido de get_active_payment_methods (o que importa aqui). */
export type CashMethod = {
  type: string;
  countries?: string[] | null;
  discount_percent?: number | string | null;
  min_total?: number | string | null;
  max_total?: number | string | null;
};

const n0 = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** Desconto à vista que vale para este valor neste país (0 = não mostrar). Mesmas regras do methodBlock do checkout. */
export function cashDiscountFor(method: CashMethod | null | undefined, countryCode: string, amount: number): number {
  if (!method) return 0;
  const list = (method.countries ?? []).map((c) => String(c).toUpperCase());
  if (list.length && !list.includes(countryCode.toUpperCase())) return 0;
  const min = method.min_total == null || method.min_total === '' ? null : n0(method.min_total);
  const max = method.max_total == null || method.max_total === '' ? null : n0(method.max_total);
  if (min != null && amount + 0.005 < min) return 0;
  if (max != null && max > 0 && amount - 0.005 > max) return 0;
  return Math.min(50, Math.max(0, n0(method.discount_percent)));
}

export const installmentsServe = (s: PriceDisplaySettings['installments'], countryCode: string) =>
  s.enabled && (!s.countries.length || s.countries.includes(countryCode.toUpperCase()));

/** O que mostrar num lugar: preço principal e linhas extras (valores na moeda base, ainda sem conversão). */
export type PriceView = {
  style: PriceStyle;
  /** O destaque pedido podia não estar disponível (ex.: sem desconto): este é o que vale. */
  highlight: PriceHighlight;
  /** Valor grande. Com highlight installment, é a parcela (installment.value). */
  main: number;
  cash: { amount: number; pct: number; savings: number } | null;
  installment: Installment | null;
  /** Preço cheio (no cartão), para as linhas "ou R$ X no cartão". */
  full: number;
};

export function priceView(
  amount: number,
  s: PriceDisplaySettings,
  place: PricePlace,
  opts: { cashPct: number; countryCode: string },
): PriceView | null {
  const ps = s.places[place];
  if (!ps?.enabled || amount <= 0) return null;
  const pct = s.cash.enabled ? opts.cashPct : 0;
  const cashAmount = pct > 0 ? cashPrice(amount, pct) : amount;
  const cash = pct > 0 && cashAmount < amount ? { amount: cashAmount, pct, savings: round2(amount - cashAmount) } : null;
  const installment = installmentsServe(s.installments, opts.countryCode) ? headlineInstallment(amount, s.installments) : null;
  let highlight = ps.highlight;
  if (highlight === 'cash' && !cash) highlight = 'card';
  if (highlight === 'installment' && !installment) highlight = 'card';
  if (!cash && !installment && highlight === 'card') return { style: ps.style, highlight, main: amount, cash: null, installment: null, full: amount };
  const main = highlight === 'cash' ? cash!.amount : highlight === 'installment' ? installment!.value : amount;
  return { style: ps.style, highlight, main, cash, installment, full: amount };
}
