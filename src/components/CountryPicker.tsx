// =====================================================================================
// Seletor de país do cabeçalho (computador e menu do celular). Um só lugar para país, idioma e moeda:
// escolher o país (com a bandeira) muda a moeda, os impostos, o frete, o pagamento e o idioma do site.
// No fim da lista o cliente pode ainda trocar só o idioma (ex.: quem fala inglês e compra no Brasil).
// Países ativos = tabela countries; nomes de país, idioma e moeda vêm do Intl. Bandeiras: <Flag /> (SVG).
// =====================================================================================
import { useMemo, useState } from 'react';
import { Check, ChevronDown, Languages, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Flag } from '@/components/Flag';
import { countryName, useCountries, useCountry, useCountryStore } from '@/lib/countries';
import { LOCALES, LOCALE_NAMES, useLocale, useMessages, type Locale } from '@/i18n';
import { layoutMessages } from '@/i18n/layout';
import { cn } from '@/lib/utils';

/** Símbolo curto da moeda no idioma atual (R$, €, US$; símbolo completo para não confundir dólares). */
const symbolOf = (currency: string, locale: string) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'symbol' }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency;

/** Nome da moeda no idioma atual ("Real brasileiro", "Euro"). */
function currencyName(currency: string, locale: string) {
  try {
    const n = new Intl.DisplayNames([locale], { type: 'currency' }).of(currency) ?? currency;
    return n.charAt(0).toLocaleUpperCase(locale) + n.slice(1);
  } catch {
    return currency;
  }
}

/** Busca sem acentos nem maiúsculas ("espanha" encontra "Espanha", "eua" não precisa de acento). */
const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const SHORT: Record<Locale, string> = { 'pt-BR': 'PT', 'pt-PT': 'PT', en: 'EN', es: 'ES' };

export function CountryPicker({ className, block = false }: { className?: string; block?: boolean }) {
  const { t, locale } = useMessages(layoutMessages);
  const setLocale = useLocale((s) => s.setLocale);
  const country = useCountry();
  const { data: countries = [] } = useCountries();
  const setCode = useCountryStore((s) => s.setCode);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const choose = (code: string) => {
    const c = countries.find((x) => x.code === code);
    setCode(code);
    if (c) setLocale(c.locale);
    setOpen(false);
  };

  const list = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return countries;
    return countries.filter((c) => fold(`${countryName(c.code, locale)} ${c.code} ${c.currency}`).includes(q));
  }, [countries, query, locale]);

  const name = countryName(country.code, locale);
  const otherLanguage = locale !== country.locale;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery(''); }}>
      <PopoverTrigger asChild>
        <button
          type="button" aria-label={`${t('shipTo')} ${name}, ${t('currencyLabel')} ${country.currency}, ${t('language')} ${LOCALE_NAMES[locale]}`}
          className={cn('group flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-white pl-2.5 pr-3 text-sm transition-colors duration-150 hover:border-primary/60 data-[state=open]:border-primary/60',
            block && 'h-12 w-full justify-between pl-3 pr-3', className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Flag code={country.code} className={cn('w-6 transition-transform duration-200 group-hover:scale-105', block && 'w-7')} />
            <span className="hidden text-muted-foreground min-[1720px]:inline">{t('shipTo')}</span>
            <span className="truncate font-semibold">{name}</span>
            <span className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-bold text-brand-orange-text">{symbolOf(country.currency, locale)}</span>
            {otherLanguage && <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground">{SHORT[locale]}</span>}
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={block ? 'center' : 'end'} side={block ? 'top' : 'bottom'} sideOffset={10}
        className="w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-[20px] border-border p-0 shadow-[var(--shadow-elevated)]">
        <div className="relative bg-brand-orange-soft px-5 pb-4 pt-4">
          <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-primary/20 blur-2xl" aria-hidden="true" />
          <p className="relative text-base font-bold tracking-tight">{t('countryTitle')}</p>
          <p className="relative mt-1 text-xs leading-relaxed text-brand-ink-soft">{t('countrySub')}</p>
          {countries.length > 6 && (
            <label className="relative mt-3 flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 focus-within:border-primary/60">
              <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('countrySearch')} aria-label={t('countrySearch')}
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </label>
          )}
        </div>

        <ul className="max-h-[min(340px,50vh)] space-y-1 overflow-y-auto p-2" role="listbox" aria-label={t('countryTitle')}>
          {list.map((c, i) => {
            const active = c.code === country.code;
            return (
              <motion.li key={c.code} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.035, duration: 0.25 }}>
                <button
                  type="button" role="option" aria-selected={active} onClick={() => choose(c.code)}
                  className={cn('group/row flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors duration-150',
                    active ? 'border-primary/40 bg-accent' : 'border-transparent hover:bg-secondary')}
                >
                  <Flag code={c.code} className="w-10 rounded-[5px] shadow-sm transition-transform duration-200 group-hover/row:scale-105" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{countryName(c.code, locale)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{LOCALE_NAMES[c.locale]} · {currencyName(c.currency, locale)}</span>
                  </span>
                  <span className={cn('grid h-7 min-w-[2.5rem] place-items-center rounded-lg px-1.5 text-xs font-bold',
                    active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground')}>{symbolOf(c.currency, locale)}</span>
                  <Check className={cn('h-4 w-4 shrink-0 text-primary transition-opacity duration-150', active ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                </button>
              </motion.li>
            );
          })}
          {!list.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{t('countryNone')}</li>}
        </ul>

        <div className="border-t border-border bg-background/60 px-4 pb-4 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Languages className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />{t('siteLanguage')}
          </p>
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={t('language')}>
            {LOCALES.map((l) => (
              <button
                key={l} type="button" role="radio" aria-checked={locale === l} lang={l} onClick={() => setLocale(l)}
                className={cn('h-9 truncate rounded-xl border px-2 text-xs font-medium transition-colors duration-150',
                  locale === l ? 'border-primary bg-white font-semibold text-brand-orange-text' : 'border-border bg-white text-foreground hover:border-primary/50')}
              >
                {LOCALE_NAMES[l]}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
