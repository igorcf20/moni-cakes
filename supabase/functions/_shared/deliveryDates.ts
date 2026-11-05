// =====================================================================================
// Prazo de produção e data de entrega (recurso delivery_dates; Admin > Configurações > Prazos e entrega).
// Este ficheiro é igual a supabase/functions/_shared/deliveryDates.ts (o teste scripts/test-delivery-dates.mjs confere):
// o site mostra as datas, o create-order grava no pedido as mesmas contas.
//   Prazo     dias úteis para preparar ou produzir: do produto (lead_time_min_days / _max_days), senão da ficha antiga
//             (production_days), senão o padrão da loja. No carrinho vale o produto mais demorado.
//   Dias      úteis = dias de trabalho da loja (work_days, 0 = domingo) que não são feriados (holidays, AAAA-MM-DD).
//   Corte     pedido feito depois da hora de corte (cutoff_hour, no fuso da loja) conta a partir do dia útil seguinte.
//   Envio     enviado até = início + prazo máximo; chega entre envio mais cedo + transporte mínimo e enviado até +
//             transporte máximo (dias da forma de envio, também em dias úteis).
// Datas sem hora (AAAA-MM-DD). Sem imports.
// =====================================================================================

export type DeliverySettings = {
  default_min: number;
  default_max: number;
  work_days: number[];
  cutoff_hour: number;
  /** Fuso IANA da loja; vazio = o do país do pedido. */
  timezone: string;
  holidays: string[];
  show_on_product: boolean;
  show_in_checkout: boolean;
};

export const DEFAULT_DELIVERY_SETTINGS: DeliverySettings = {
  default_min: 1,
  default_max: 3,
  work_days: [1, 2, 3, 4, 5],
  cutoff_hour: 14,
  timezone: '',
  holidays: [],
  show_on_product: true,
  show_in_checkout: true,
};

export const MAX_LEAD_DAYS = 120;
export const TZ_BY_COUNTRY: Record<string, string> = {
  BR: 'America/Sao_Paulo', PT: 'Europe/Lisbon', ES: 'Europe/Madrid', US: 'America/New_York', FR: 'Europe/Paris',
  DE: 'Europe/Berlin', IT: 'Europe/Rome', GB: 'Europe/London', MX: 'America/Mexico_City', AR: 'America/Argentina/Buenos_Aires',
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const int = (v: unknown, min: number, max: number, def: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeDeliverySettings(raw: unknown): DeliverySettings {
  const o = obj(raw);
  const d = DEFAULT_DELIVERY_SETTINGS;
  const min = int(o.default_min, 0, MAX_LEAD_DAYS, d.default_min);
  const days = Array.isArray(o.work_days)
    ? [...new Set(o.work_days.map((x) => Math.floor(Number(x))).filter((x) => x >= 0 && x <= 6))].sort()
    : d.work_days;
  return {
    default_min: min,
    default_max: Math.max(min, int(o.default_max, 0, MAX_LEAD_DAYS, Math.max(min, d.default_max))),
    work_days: days.length ? days : d.work_days,
    cutoff_hour: int(o.cutoff_hour, 0, 24, d.cutoff_hour),
    timezone: typeof o.timezone === 'string' && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(o.timezone) ? o.timezone : '',
    holidays: Array.isArray(o.holidays) ? [...new Set(o.holidays.map(String).filter((s) => DATE_RE.test(s)))].sort().slice(0, 200) : [],
    show_on_product: o.show_on_product !== false,
    show_in_checkout: o.show_in_checkout !== false,
  };
}

export type LeadTime = { min: number; max: number };
type LeadSource = { lead_time_min_days?: unknown; lead_time_max_days?: unknown; technical_specs?: unknown; specifications?: unknown };

/** Prazo do produto: o dele, senão o da ficha antiga (production_days), senão o padrão da loja. */
export function leadTimeFor(p: LeadSource | null | undefined, s: DeliverySettings): LeadTime {
  const min = p?.lead_time_min_days == null || p.lead_time_min_days === '' ? NaN : Number(p.lead_time_min_days);
  const max = p?.lead_time_max_days == null || p.lead_time_max_days === '' ? NaN : Number(p.lead_time_max_days);
  if (Number.isFinite(min) || Number.isFinite(max)) {
    const a = int(Number.isFinite(min) ? min : max, 0, MAX_LEAD_DAYS, 0);
    const b = int(Number.isFinite(max) ? max : min, 0, MAX_LEAD_DAYS, a);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  for (const src of [p?.technical_specs, p?.specifications]) {
    const v = obj(src).production_days;
    const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v;
    if (typeof n === 'number' && n > 0) return { min: int(n, 0, MAX_LEAD_DAYS, 0), max: int(n, 0, MAX_LEAD_DAYS, 0) };
  }
  return { min: s.default_min, max: s.default_max };
}

/** Carrinho: vale o produto mais demorado (o pedido sai inteiro). */
export function cartLeadTime(items: Array<LeadSource | null | undefined>, s: DeliverySettings): LeadTime {
  if (!items.length) return { min: s.default_min, max: s.default_max };
  const all = items.map((p) => leadTimeFor(p, s));
  return { min: Math.max(...all.map((l) => l.min)), max: Math.max(...all.map((l) => l.max)) };
}

export const timezoneFor = (s: DeliverySettings, countryCode?: string | null) =>
  s.timezone || TZ_BY_COUNTRY[String(countryCode || '').toUpperCase()] || 'UTC';

/** Data e hora no fuso dado (a data do calendário de lá). */
export function localNow(now: Date, timezone: string): { date: string; hour: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  }
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hour: Number(g('hour')) % 24 };
}

const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const fromDate = (d: Date) => d.toISOString().slice(0, 10);
export function addDays(date: string, n: number): string {
  const d = toDate(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDate(d);
}
export const isBusinessDay = (date: string, s: DeliverySettings) => s.work_days.includes(toDate(date).getUTCDay()) && !s.holidays.includes(date);

/** O próprio dia, se útil; senão o próximo dia útil. */
export function nextBusinessDay(date: string, s: DeliverySettings): string {
  let d = date;
  for (let i = 0; i < 400 && !isBusinessDay(d, s); i++) d = addDays(d, 1);
  return d;
}

/** Soma n dias úteis (0 = o próprio dia, já útil). */
export function addBusinessDays(date: string, n: number, s: DeliverySettings): string {
  let d = nextBusinessDay(date, s);
  for (let i = 0; i < n; i++) d = nextBusinessDay(addDays(d, 1), s);
  return d;
}

export type DeliveryEstimate = {
  /** Primeiro dia útil de trabalho no pedido. */
  start: string;
  /** Pronto ou enviado o mais cedo e o mais tarde. */
  ship_from: string;
  ship_by: string;
  /** Chega entre (só com os dias de transporte da forma de envio). */
  deliver_from: string | null;
  deliver_to: string | null;
};

/** Datas de um pedido feito agora. transit = dias úteis da forma de envio (null = sem dados, sem data de chegada). */
export function estimateDelivery(now: Date, lead: LeadTime, transit: { min: number | null; max: number | null } | null, s: DeliverySettings, countryCode?: string | null): DeliveryEstimate {
  const local = localNow(now, timezoneFor(s, countryCode));
  let start = local.date;
  if (!isBusinessDay(start, s) || local.hour >= s.cutoff_hour) start = nextBusinessDay(addDays(start, 1), s);
  const ship_from = addBusinessDays(start, lead.min, s);
  const ship_by = addBusinessDays(start, lead.max, s);
  const tMin = transit?.min ?? transit?.max ?? null;
  const tMax = transit?.max ?? transit?.min ?? null;
  return {
    start,
    ship_from,
    ship_by,
    deliver_from: tMin == null ? null : addBusinessDays(ship_from, Math.max(0, tMin), s),
    deliver_to: tMax == null ? null : addBusinessDays(ship_by, Math.max(0, tMax), s),
  };
}

/** "seg., 13 de out." no idioma dado (data sem hora, sem mudar de dia por causa do fuso). */
export function formatDay(date: string, locale: string, withWeekday = true): string {
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short', ...(withWeekday ? { weekday: 'short' } : {}) }).format(toDate(date));
}

/** Pedido atrasado: ainda não enviado e o "enviar até" já passou. */
export function isLate(shipBy: string | null | undefined, status: string | null | undefined, today: string): boolean {
  if (!shipBy || !DATE_RE.test(shipBy)) return false;
  if (['shipped', 'delivered', 'cancelled', 'refunded'].includes(String(status))) return false;
  return shipBy < today;
}
