// =====================================================================================
// Aluguel (recurso rentals; Admin > Vendas > Aluguéis). Este ficheiro é igual a supabase/functions/_shared/rentals.ts
// (o teste scripts/test-rentals.mjs confere): o site mostra o preço e valida as datas, o servidor (priceItems no
// create-order) cobra o mesmo e o banco (trigger order_items_rental) confere se há unidades livres.
//   Produto para alugar  product_rentals: preço do produto = preço por período (dia, semana ou mês), mínimo e máximo
//                        de períodos, unidades disponíveis e caução (paga na entrega, fora da loja).
//   Reserva              rental_bookings: nasce da linha do pedido com design_data.rental {start, end}.
//   Regras da loja       store_settings.rentals: antecedência mínima, dias livres entre reservas e até quando reservar.
// Datas sem hora (AAAA-MM-DD), primeiro e último dia incluídos. Sem imports.
// =====================================================================================

export type RentalUnit = 'day' | 'week' | 'month';
export const RENTAL_UNITS: RentalUnit[] = ['day', 'week', 'month'];
export type BookingStatus = 'reserved' | 'out' | 'returned' | 'cancelled';
export const BOOKING_STATUSES: BookingStatus[] = ['reserved', 'out', 'returned', 'cancelled'];

export type RentalProduct = {
  product_id: string;
  is_active: boolean;
  unit: RentalUnit;
  min_periods: number;
  max_periods: number | null;
  units: number;
  deposit: number;
};

export type RentalSettings = {
  /** Dias mínimos entre hoje e o primeiro dia do aluguel (0 = pode começar hoje). */
  lead_days: number;
  /** Dias livres antes e depois de cada reserva (limpeza, revisão, transporte). */
  buffer_days: number;
  /** Até quantos dias à frente o cliente pode reservar. */
  max_days_ahead: number;
};

export const DEFAULT_RENTAL_SETTINGS: RentalSettings = { lead_days: 1, buffer_days: 0, max_days_ahead: 180 };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const int = (v: unknown, min: number, max: number, def: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeRentalSettings(raw: unknown): RentalSettings {
  const o = obj(raw);
  return {
    lead_days: int(o.lead_days, 0, 365, DEFAULT_RENTAL_SETTINGS.lead_days),
    buffer_days: int(o.buffer_days, 0, 30, DEFAULT_RENTAL_SETTINGS.buffer_days),
    max_days_ahead: int(o.max_days_ahead, 7, 730, DEFAULT_RENTAL_SETTINGS.max_days_ahead),
  };
}

export function normalizeRentalProduct(raw: unknown): RentalProduct {
  const o = obj(raw);
  const unit = RENTAL_UNITS.includes(o.unit as RentalUnit) ? (o.unit as RentalUnit) : 'day';
  const min = int(o.min_periods, 1, 365, 1);
  const max = o.max_periods == null || o.max_periods === '' ? null : Math.max(min, int(o.max_periods, 1, 730, min));
  const deposit = Number(o.deposit);
  return {
    product_id: String(o.product_id ?? ''),
    is_active: o.is_active !== false,
    unit,
    min_periods: min,
    max_periods: max,
    units: int(o.units, 1, 10000, 1),
    deposit: Number.isFinite(deposit) && deposit > 0 ? Math.round(deposit * 100) / 100 : 0,
  };
}

const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const fromDate = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(date: string, n: number): string {
  const d = toDate(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDate(d);
}

function addMonths(date: string, n: number): string {
  const d = toDate(date);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return fromDate(target);
}

/** Dias do aluguel, com o primeiro e o último incluídos (0 se as datas não servem). */
export function rentalDays(start: string, end: string): number {
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || end < start) return 0;
  return Math.round((toDate(end).getTime() - toDate(start).getTime()) / 86_400_000) + 1;
}

/** Períodos cobrados: dias; semanas começadas; meses começados (do dia de início ao mesmo dia do mês seguinte). */
export function rentalPeriods(start: string, end: string, unit: RentalUnit): number {
  const days = rentalDays(start, end);
  if (!days) return 0;
  if (unit === 'day') return days;
  if (unit === 'week') return Math.ceil(days / 7);
  let n = 1;
  while (addMonths(start, n) <= end && n < 1000) n += 1;
  return n;
}

export type RentalError = 'invalid_dates' | 'too_soon' | 'too_far' | 'too_short' | 'too_long';

/** Confere as datas com as regras do produto e da loja. null = tudo certo. */
export function rentalError(start: string, end: string, p: RentalProduct, s: RentalSettings, today: string): RentalError | null {
  const periods = rentalPeriods(start, end, p.unit);
  if (!periods) return 'invalid_dates';
  if (start < addDays(today, s.lead_days)) return 'too_soon';
  if (end > addDays(today, s.max_days_ahead)) return 'too_far';
  if (periods < p.min_periods) return 'too_short';
  if (p.max_periods != null && periods > p.max_periods) return 'too_long';
  return null;
}

/** Preço do aluguel de uma unidade: preço por período x períodos. */
export const rentalUnitPrice = (pricePerPeriod: number, periods: number) => Math.max(0, pricePerPeriod) * Math.max(0, periods);

export type BookingSpan = { start_date: string; end_date: string; quantity: number; status: string };

/** Uma reserva ocupa as suas datas mais os dias livres antes e depois. Devolvidas e canceladas não ocupam. */
export const blocks = (b: BookingSpan) => b.status === 'reserved' || b.status === 'out';

/** Unidades livres em todos os dias do período pedido (o pior dia manda). */
export function freeUnits(bookings: BookingSpan[], start: string, end: string, units: number, bufferDays: number): number {
  const days = rentalDays(start, end);
  if (!days) return 0;
  let worst = 0;
  for (let i = 0; i < days; i += 1) {
    const day = addDays(start, i);
    const used = bookings.filter((b) => blocks(b) && addDays(b.start_date, -bufferDays) <= day && day <= addDays(b.end_date, bufferDays))
      .reduce((s, b) => s + Math.max(0, b.quantity), 0);
    worst = Math.max(worst, used);
  }
  return Math.max(0, units - worst);
}

/** Devolução atrasada: o cliente está com o produto e já passou o último dia. */
export const returnLate = (b: { status: string; end_date: string }, today: string) => b.status === 'out' && b.end_date < today;
