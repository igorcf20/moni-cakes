// Página do produto: datas do aluguel (recurso rentals, produto com aluguel ativo em Admin > produto > aba Aluguel).
// Mostra o preço por período, confere as regras (src/lib/rentals.ts) e as unidades livres (rental_free_units) e
// devolve ao pai a escolha válida (design_data.rental) ou null. O servidor confere tudo de novo no pedido.
import { useEffect, useMemo } from 'react';
import { AlertCircle, CalendarRange, CheckCircle2, Loader2 } from 'lucide-react';
import { useMessages } from '@/i18n';
import { longDay, periodsText, rentalsMessages } from '@/i18n/rentals';
import { useRentalFree } from '@/hooks/useRentals';
import { addDays, rentalError, rentalPeriods, rentalUnitPrice, type RentalProduct, type RentalSettings } from '@/lib/rentals';
import { cn } from '@/lib/utils';

export type RentalChoice = { start: string; end: string; unit: string; periods: number };

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function RentalPicker({ productId, rental, settings, unitNet, fmt, fmtDeposit, qty, start, end, onDates, onChoice }: {
  productId: string;
  rental: RentalProduct;
  settings: RentalSettings;
  /** Preço por período (sem imposto), como o resto da página. */
  unitNet: number;
  fmt: (net: number) => string;
  /** Caução sem imposto (paga fora da loja). */
  fmtDeposit: (value: number) => string;
  qty: number;
  start: string;
  end: string;
  onDates: (start: string, end: string) => void;
  onChoice: (choice: RentalChoice | null) => void;
}) {
  const { t, locale } = useMessages(rentalsMessages);
  const today = localToday();
  const first = addDays(today, settings.lead_days);
  const last = addDays(today, settings.max_days_ahead);
  const err = start && end ? rentalError(start, end, rental, settings, today) : null;
  const periods = start && end && !err ? rentalPeriods(start, end, rental.unit) : 0;
  const free = useRentalFree(productId, start, end, periods > 0);
  const enough = free.data != null && free.data >= qty;
  const choice = useMemo<RentalChoice | null>(
    () => (periods > 0 && enough ? { start, end, unit: rental.unit, periods } : null),
    [periods, enough, start, end, rental.unit],
  );
  useEffect(() => { onChoice(choice); }, [choice, onChoice]);

  const per = (n: number) => periodsText(t, rental.unit, n);
  const errText = err === 'too_soon' ? t('err_too_soon', { date: longDay(locale, first) })
    : err === 'too_far' ? t('err_too_far', { date: longDay(locale, last) })
    : err === 'too_short' ? t('err_too_short', { periods: per(rental.min_periods) })
    : err === 'too_long' ? t('err_too_long', { periods: per(rental.max_periods ?? rental.min_periods) })
    : err ? t('err_invalid_dates') : null;
  const rules = [
    rental.min_periods > 1 ? t('rule_min', { periods: per(rental.min_periods) }) : null,
    rental.max_periods ? t('rule_max', { periods: per(rental.max_periods) }) : null,
    settings.lead_days > 0 ? t('rule_lead', { date: longDay(locale, first) }) : null,
  ].filter(Boolean).join(' ');
  const input = 'h-12 w-full rounded-[14px] border border-border bg-white px-3 text-[16px] md:text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <fieldset data-option="rental" className="space-y-3 rounded-[18px] border border-brand-card-border bg-white p-4">
      <legend className="sr-only">{t('title')}</legend>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-center gap-2 text-[15px] font-semibold"><CalendarRange className="h-[18px] w-[18px] text-brand-orange-text" strokeWidth={1.9} aria-hidden="true" />{t('title')}</p>
        <p className="text-[15px] font-bold">{t(`price_${rental.unit}`, { price: fmt(unitNet) })}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5 text-[14px] font-semibold">
          <span>{t('start')}</span>
          <input type="date" className={input} value={start} min={first} max={last}
            onChange={(e) => onDates(e.target.value, end && end < e.target.value ? e.target.value : end)} />
        </label>
        <label className="space-y-1.5 text-[14px] font-semibold">
          <span>{t('end')}</span>
          <input type="date" className={input} value={end} min={start || first} max={last} onChange={(e) => onDates(start, e.target.value)} />
        </label>
      </div>
      {rules && <p className="text-[13px] text-brand-ink-soft">{rules}</p>}

      {!start || !end ? (
        <p className="text-[14px] text-brand-ink-soft">{t('choose')}</p>
      ) : errText ? (
        <p className="flex items-start gap-2 text-[14px] font-medium text-destructive" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{errText}</p>
      ) : (
        <div className="space-y-1.5" aria-live="polite">
          <p className="text-[15px] font-semibold tabular-nums">{t('summary', { periods: per(periods), price: fmt(unitNet), total: fmt(rentalUnitPrice(unitNet, periods)) })}</p>
          {qty > 1 && <p className="text-[13px] text-brand-ink-soft">{t('summary_qty', { qty, total: fmt(rentalUnitPrice(unitNet, periods) * qty) })}</p>}
          {free.isLoading ? (
            <p className="flex items-center gap-2 text-[14px] text-brand-ink-soft"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t('checking')}</p>
          ) : (
            <p className={cn('flex items-start gap-2 text-[14px] font-medium', enough ? 'text-emerald-700' : 'text-destructive')} role="status">
              {enough ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              {enough ? (rental.units > 1 ? t('available_n', { n: free.data ?? 0 }) : t('available'))
                : (free.data ?? 0) > 0 ? t('unavailable_qty', { n: free.data ?? 0 }) : t('unavailable')}
            </p>
          )}
        </div>
      )}
      {rental.deposit > 0 && <p className="rounded-xl bg-brand-alt px-3 py-2 text-[13px] text-brand-ink-soft">{t('deposit', { value: fmtDeposit(rental.deposit) })}</p>}
    </fieldset>
  );
}
