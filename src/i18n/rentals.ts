// Textos do aluguel para o cliente: página do produto, carrinho, checkout e pedidos. Sem emojis nem travessões.
import { defineMessages } from './index';

const ptBR = {
  title: 'Datas do aluguel',
  price_day: '{price} por dia',
  price_week: '{price} por semana',
  price_month: '{price} por mês',
  start: 'Início',
  end: 'Fim (devolução)',
  p_day_one: '1 dia',
  p_day: '{n} dias',
  p_week_one: '1 semana',
  p_week: '{n} semanas',
  p_month_one: '1 mês',
  p_month: '{n} meses',
  summary: '{periods} x {price} = {total}',
  summary_qty: 'Por unidade. Com {qty} unidades: {total}',
  checking: 'Conferindo as datas...',
  available: 'Disponível nessas datas.',
  available_n: 'Disponível nessas datas ({n} livres).',
  unavailable: 'Não há unidades livres nessas datas. Escolha outras datas.',
  unavailable_qty: 'Nessas datas só há {n} livre(s). Diminua a quantidade ou escolha outras datas.',
  deposit: 'Caução de {value} por unidade, paga na retirada e devolvida quando o produto volta.',
  rule_min: 'Mínimo de {periods}.',
  rule_max: 'Máximo de {periods}.',
  rule_lead: 'Reservas a partir de {date}.',
  choose: 'Escolha as datas de início e fim para continuar.',
  err_invalid_dates: 'A data de fim precisa ser igual ou depois da data de início.',
  err_too_soon: 'A data de início precisa ser a partir de {date}.',
  err_too_far: 'Dá para reservar até {date}.',
  err_too_short: 'O mínimo para este produto é {periods}.',
  err_too_long: 'O máximo para este produto é {periods}.',
  cart_label: 'Aluguel: {from} a {to}',
  cart_periods: '{periods}',
};

export type RentalsKey = keyof typeof ptBR;

export const rentalsMessages = defineMessages({
  'pt-BR': ptBR,
  'pt-PT': {
    ...ptBR,
    checking: 'A conferir as datas...',
    available_n: 'Disponível nessas datas ({n} livres).',
    unavailable_qty: 'Nessas datas só há {n} livre(s). Reduza a quantidade ou escolha outras datas.',
    deposit: 'Caução de {value} por unidade, paga no levantamento e devolvida quando o produto volta.',
    choose: 'Escolha as datas de início e fim para continuar.',
    err_invalid_dates: 'A data de fim tem de ser igual ou posterior à data de início.',
    err_too_soon: 'A data de início tem de ser a partir de {date}.',
    err_too_far: 'Pode reservar até {date}.',
    title: 'Datas do aluguer',
    cart_label: 'Aluguer: {from} a {to}',
  },
  en: {
    title: 'Rental dates',
    price_day: '{price} per day',
    price_week: '{price} per week',
    price_month: '{price} per month',
    start: 'Start',
    end: 'End (return)',
    p_day_one: '1 day',
    p_day: '{n} days',
    p_week_one: '1 week',
    p_week: '{n} weeks',
    p_month_one: '1 month',
    p_month: '{n} months',
    summary: '{periods} x {price} = {total}',
    summary_qty: 'Per unit. With {qty} units: {total}',
    checking: 'Checking the dates...',
    available: 'Available on these dates.',
    available_n: 'Available on these dates ({n} free).',
    unavailable: 'No units are free on these dates. Please choose other dates.',
    unavailable_qty: 'Only {n} free on these dates. Lower the quantity or choose other dates.',
    deposit: 'Deposit of {value} per unit, paid at pickup and returned when the product comes back.',
    rule_min: 'Minimum of {periods}.',
    rule_max: 'Maximum of {periods}.',
    rule_lead: 'Bookings from {date}.',
    choose: 'Choose the start and end dates to continue.',
    err_invalid_dates: 'The end date must be the same as or after the start date.',
    err_too_soon: 'The start date must be from {date}.',
    err_too_far: 'You can book until {date}.',
    err_too_short: 'The minimum for this product is {periods}.',
    err_too_long: 'The maximum for this product is {periods}.',
    cart_label: 'Rental: {from} to {to}',
    cart_periods: '{periods}',
  },
  es: {
    title: 'Fechas del alquiler',
    price_day: '{price} por día',
    price_week: '{price} por semana',
    price_month: '{price} por mes',
    start: 'Inicio',
    end: 'Fin (devolución)',
    p_day_one: '1 día',
    p_day: '{n} días',
    p_week_one: '1 semana',
    p_week: '{n} semanas',
    p_month_one: '1 mes',
    p_month: '{n} meses',
    summary: '{periods} x {price} = {total}',
    summary_qty: 'Por unidad. Con {qty} unidades: {total}',
    checking: 'Comprobando las fechas...',
    available: 'Disponible en esas fechas.',
    available_n: 'Disponible en esas fechas ({n} libres).',
    unavailable: 'No hay unidades libres en esas fechas. Elija otras fechas.',
    unavailable_qty: 'En esas fechas solo hay {n} libre(s). Reduzca la cantidad o elija otras fechas.',
    deposit: 'Fianza de {value} por unidad, pagada en la recogida y devuelta cuando el producto vuelve.',
    rule_min: 'Mínimo de {periods}.',
    rule_max: 'Máximo de {periods}.',
    rule_lead: 'Reservas a partir del {date}.',
    choose: 'Elija las fechas de inicio y fin para continuar.',
    err_invalid_dates: 'La fecha de fin debe ser igual o posterior a la de inicio.',
    err_too_soon: 'La fecha de inicio debe ser a partir del {date}.',
    err_too_far: 'Puede reservar hasta el {date}.',
    err_too_short: 'El mínimo para este producto es {periods}.',
    err_too_long: 'El máximo para este producto es {periods}.',
    cart_label: 'Alquiler: {from} a {to}',
    cart_periods: '{periods}',
  },
});

type Tr = (k: RentalsKey, v?: Record<string, string | number>) => string;

/** "3 dias", "1 semana", "2 meses". */
export function periodsText(t: Tr, unit: string, n: number): string {
  const u = unit === 'week' || unit === 'month' ? unit : 'day';
  return n === 1 ? t(`p_${u}_one` as RentalsKey) : t(`p_${u}` as RentalsKey, { n });
}

/** Data curta sem hora ("10 de nov."), no fuso UTC para não mudar de dia. */
export function shortDay(locale: string, date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${date}T00:00:00Z`));
}

/** Data por extenso sem ano ("10 de novembro"), para regras e avisos. */
export function longDay(locale: string, date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(`${date}T00:00:00Z`));
}

/** "Aluguel: 10 de nov. a 12 de nov." para carrinho, checkout e pedidos. */
export function rentalRangeText(t: Tr, locale: string, r: { start?: unknown; end?: unknown }): string {
  return t('cart_label', { from: shortDay(locale, String(r.start ?? '')), to: shortDay(locale, String(r.end ?? '')) });
}
