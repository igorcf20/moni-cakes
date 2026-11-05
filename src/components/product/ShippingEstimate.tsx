// Calcular o frete na página do produto (recurso shipping_estimate, regras em src/lib/shippingEstimate.ts).
// O cliente escreve o CEP / código postal; no Brasil o estado vem do ViaCEP, nos outros países escolhe a região.
// A conta é do servidor (shipping-quote, a mesma do checkout) e só aparece com formas de envio ligadas.
import { useEffect, useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Loader2, MapPin, Truck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFeature } from '@/hooks/useFeatures';
import { useHasShippingServices, type ShippingQuote } from '@/hooks/useShippingQuote';
import { useShippingEstimateSettings } from '@/hooks/useOfferSettings';
import { useCurrency } from '@/hooks/use-currency';
import { useCountry } from '@/lib/countries';
import { addressFormat, isValidPostal, lookupPostal, regionToValue } from '@/lib/addressFormats';
import { daysRange, pickEstimateOptions } from '@/lib/shippingEstimate';
import { useMessages } from '@/i18n';
import { shippingEstimateMessages } from '@/i18n/shippingEstimate';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/utils/currency';

type Line = { product_id: string; quantity: number; price: number; design_data?: unknown };

export function ShippingEstimate({ line, className }: { line: Line | null; className?: string }) {
  const on = useFeature('shipping_estimate');
  const { data: settings } = useShippingEstimateSettings();
  const { data: hasServices } = useHasShippingServices();
  if (!on || !settings || settings.product === 'off' || !hasServices || !line) return null;
  return <EstimateBox line={line} style={settings.product} showDays={settings.showDays} max={settings.maxOptions} className={className} />;
}

function EstimateBox({ line, style, showDays, max, className }: { line: Line; style: 'box' | 'link'; showDays: boolean; max: number; className?: string }) {
  const { t, locale } = useMessages(shippingEstimateMessages);
  const country = useCountry();
  const fmt = addressFormat(country.postalCodeKind);
  const { currentCurrency, convert } = useCurrency();
  const [open, setOpen] = useState(style === 'box');
  const [postal, setPostal] = useState('');
  const [region, setRegion] = useState('');
  const [asked, setAsked] = useState<{ postal: string; region: string; city: string } | null>(null);
  const [looking, setLooking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const boxId = useId();
  const inputId = useId();
  // O país mudou: o código antigo deixa de servir.
  useEffect(() => { setPostal(''); setRegion(''); setAsked(null); setProblem(null); }, [country.code]);
  const needsRegion = fmt.regions.length > 0 && !fmt.lookup;

  const quote = useQuery({
    queryKey: ['pdpShippingEstimate', country.code, asked?.postal, asked?.region, line.product_id, line.quantity, line.price, JSON.stringify(line.design_data ?? null)],
    enabled: !!asked,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<ShippingQuote> => {
      const { data, error } = await supabase.functions.invoke('shipping-quote', {
        body: { country_code: country.code, address: { postal_code: asked!.postal, region: asked!.region, city: asked!.city }, items: [line] },
      });
      if (error) throw error;
      return data as ShippingQuote;
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = fmt.formatPostal(postal);
    if (!isValidPostal(fmt, value)) { setProblem(t('invalid', { example: fmt.postalPlaceholder })); return; }
    if (needsRegion && !region) { setProblem(t('need_region')); return; }
    setProblem(null);
    let r = region, city = '';
    if (fmt.lookup) {
      setLooking(true);
      const found = await lookupPostal(fmt, value).finally(() => setLooking(false));
      if (found) { r = found.region; city = found.city; }
    }
    setAsked({ postal: value, region: r, city });
  };

  const money = (cents: number) => formatPrice(convert(cents / 100), currentCurrency);
  const days = (o: { days_min: number | null; days_max: number | null }) => {
    const d = daysRange(o);
    if (!d) return null;
    if (d.min === d.max) return d.min === 1 ? t('days_one', { min: 1 }) : t('days_same', { min: d.min });
    return t('days_range', { min: d.min, max: d.max });
  };
  const options = quote.data ? pickEstimateOptions(quote.data.options ?? [], max) : [];
  const busy = looking || quote.isFetching;

  const body = (
    <div id={boxId} className={cn('rounded-[18px] border border-brand-card-border bg-white p-4', style === 'link' && 'mt-1')}>
      {style === 'box' && (
        <p className="flex items-center gap-2 text-[15px] font-semibold"><Truck className="h-[18px] w-[18px] text-primary" strokeWidth={1.8} aria-hidden="true" />{t('title')}</p>
      )}
      <form onSubmit={(e) => void submit(e)} className={cn('flex flex-wrap items-end gap-2', style === 'box' && 'mt-3')} noValidate>
        <div className="min-w-[140px] flex-1">
          <label htmlFor={inputId} className="mb-1 block text-[13px] font-medium text-brand-ink-soft">{t('postal')}</label>
          <input id={inputId} value={postal} inputMode={fmt.kind === 'generic' ? 'text' : 'numeric'} autoComplete="postal-code"
            placeholder={fmt.postalPlaceholder} onChange={(e) => { setPostal(fmt.formatPostal(e.target.value)); setProblem(null); }}
            aria-invalid={!!problem} aria-describedby={problem ? `${inputId}-err` : undefined}
            className="h-11 w-full rounded-[14px] border border-input bg-white px-3 text-[15px] tabular-nums outline-none transition-shadow duration-150 focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        {needsRegion && (
          <div className="min-w-[140px] flex-1">
            <label htmlFor={`${inputId}-r`} className="mb-1 block text-[13px] font-medium text-brand-ink-soft">{t('region')}</label>
            <select id={`${inputId}-r`} value={region} onChange={(e) => { setRegion(e.target.value); setProblem(null); }}
              className="h-11 w-full rounded-[14px] border border-input bg-white px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">{t('region_choose')}</option>
              {fmt.regions.map((r) => <option key={r.code} value={regionToValue(fmt, r)}>{r.name}</option>)}
            </select>
          </div>
        )}
        <button type="submit" disabled={busy}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] border border-foreground/15 bg-white px-4 text-[15px] font-semibold transition-colors duration-150 hover:border-primary hover:text-brand-orange-text disabled:opacity-60">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{busy ? t('calculating') : t('calc')}
        </button>
      </form>
      {problem && <p id={`${inputId}-err`} className="mt-2 text-[13px] text-destructive">{problem}</p>}
      {fmt.kind === 'br_cep' && !asked && (
        <a href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener noreferrer"
          className="mt-1 inline-flex min-h-[36px] items-center text-[13px] text-muted-foreground underline-offset-4 hover:text-brand-orange-text hover:underline">{t('dont_know')}</a>
      )}
      <div aria-live="polite">
        {asked && quote.isError && <p className="mt-3 text-[13px] text-muted-foreground">{t('error')}</p>}
        {asked && quote.data && !options.length && <p className="mt-3 text-[13px] text-muted-foreground">{t('none')}</p>}
        {options.length > 0 && (
          <>
            <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted-foreground"><MapPin className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />{asked?.postal}</p>
            <ul className="mt-2 divide-y divide-border rounded-[14px] border border-border">
              {options.map((o) => {
                const name = (o as { name_i18n?: Record<string, string> }).name_i18n?.[locale] || (o as { name?: string }).name || '';
                const d = showDays ? days(o) : null;
                return (
                  <li key={o.service_id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[14px]">
                    <span className="min-w-0">
                      <span className="block font-medium">{name}</span>
                      {d && <span className="block text-[12.5px] text-muted-foreground">{d}</span>}
                    </span>
                    <span className={cn('shrink-0 tabular-nums font-semibold', o.free && 'text-emerald-700')}>{o.free ? t('free') : money(o.price_cents)}</span>
                  </li>
                );
              })}
            </ul>
            {line.quantity > 1 && <p className="mt-2 text-[12px] text-muted-foreground">{t('for_qty', { qty: line.quantity })}</p>}
            <p className="mt-1 text-[12px] text-muted-foreground">{t('note')}</p>
          </>
        )}
      </div>
    </div>
  );

  if (style === 'box') return <div className={className}>{body}</div>;
  return (
    <div className={className}>
      <button type="button" aria-expanded={open} aria-controls={boxId} onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-[44px] items-center gap-2 text-[14px] font-semibold text-brand-ink-soft transition-colors duration-150 hover:text-brand-orange-text">
        <Truck className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />{t('open')}
        <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            {body}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
