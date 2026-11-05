import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { ChevronDown, Search, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useMessages } from '@/i18n';
import { catalogMessages, countKey } from '@/i18n/catalog';
import { useCatalogMenu } from '@/hooks/useCatalogMenu';
import { cn } from '@/lib/utils';
import { specText, toggleSpec, type SpecFacet } from '@/lib/productSpecs';
import { toggleBrand } from '@/lib/brands';
import { parseAmount, type PriceBounds, type PriceRange } from './listing';
import { searchQuery } from './text';
import type { Listing } from './useListing';
import { btnPrimary, btnSecondary } from './ui';

/* ------------------------------------------------------------------ */
/* Dinheiro na moeda atual (sem casas decimais, para faixas)           */
/* ------------------------------------------------------------------ */

function useMoney(currency: string) {
  const { locale } = useMessages(catalogMessages);
  return useMemo(() => {
    let f: Intl.NumberFormat | null = null;
    try { f = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }); } catch { f = null; }
    const symbol = f?.formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency;
    let name = currency;
    try { name = new Intl.DisplayNames([locale], { type: 'currency' }).of(currency) ?? currency; } catch { name = currency; }
    // valores dos campos: sem separador de milhar e com o separador decimal do idioma, para serem lidos de volta igual
    let plain: Intl.NumberFormat | null = null;
    try { plain = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 2 }); } catch { plain = null; }
    let decimal = '.';
    try { decimal = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? '.'; } catch { decimal = '.'; }
    return {
      format: (v: number) => (f ? f.format(v) : `${Math.round(v)} ${currency}`),
      input: (v: number) => (plain ? plain.format(v) : String(v)),
      parse: (v: string) => parseAmount(v, decimal),
      symbol,
      name,
    };
  }, [locale, currency]);
}

function usePriceLabel(currency: string) {
  const { t } = useMessages(catalogMessages);
  const money = useMoney(currency);
  return (r: PriceRange) =>
    r.min !== null && r.max !== null ? t('priceBetween', { min: money.format(r.min), max: money.format(r.max) })
      : r.min !== null ? t('priceFrom', { value: money.format(r.min) })
        : t('priceUpTo', { value: money.format(r.max ?? 0) });
}

/* ------------------------------------------------------------------ */
/* Peças do painel                                                     */
/* ------------------------------------------------------------------ */

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const id = useId();
  return (
    <section className="border-t border-border py-3">
      <h3>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={open ? id : undefined}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg text-left text-[15px] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {title}
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="pb-1 pt-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** Busca na listagem: atualiza ?q= depois de uma pausa na digitação (ou ao enviar). */
function SearchField({ listing }: { listing: Listing }) {
  const { t } = useMessages(catalogMessages);
  const { params, update } = listing;
  const [value, setValue] = useState(params.q);
  const sent = useRef(params.q);
  const dirty = useRef(false);
  // Na mesma digitação, a primeira busca cria uma entrada no histórico e as seguintes substituem-na.
  const typing = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (params.q !== sent.current) { sent.current = params.q; dirty.current = false; typing.current = false; setValue(params.q); }
  }, [params.q]);

  // Uma busca sem palavras válidas (ex.: uma letra) vale como busca vazia, como em parseParams.
  useEffect(() => {
    if (!dirty.current) return;
    const timer = window.setTimeout(() => {
      dirty.current = false;
      const q = searchQuery(value);
      if (q !== params.q) {
        sent.current = q;
        update({ q }, { replace: typing.current });
        typing.current = document.activeElement === input.current;
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [value, params.q, update]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    dirty.current = false;
    const q = searchQuery(value);
    if (q !== params.q) { sent.current = q; update({ q }, { replace: typing.current }); }
    typing.current = false;
  };

  return (
    <form role="search" onSubmit={submit} className="relative">
      <label htmlFor={id} className="sr-only">{t('searchLabel')}</label>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
      <input
        ref={input} id={id} type="search" value={value} enterKeyHint="search" maxLength={80} placeholder={t('searchPlaceholder')}
        onChange={(e) => { dirty.current = true; setValue(e.target.value); }} onBlur={() => { if (!dirty.current) typing.current = false; }}
        className="h-12 w-full rounded-[14px] border border-border bg-white pl-10 pr-12 text-[15px] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus:border-primary focus:shadow-[var(--shadow-ring-royal)] [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" onClick={() => { dirty.current = false; setValue(''); sent.current = ''; if (params.q) update({ q: '' }); }}
          aria-label={t('searchClear')} className="absolute right-0.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-[12px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <X className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}
    </form>
  );
}

/** Categorias com contagem (só em /produtos). */
function CategoryFacet({ listing }: { listing: Listing }) {
  const { params, update, categoryFacets } = listing;
  const toggle = (slug: string, on: boolean) => {
    const next = on ? [...params.cats, slug] : params.cats.filter((c) => c !== slug);
    update({ cats: categoryFacets.map((c) => c.slug).filter((s) => next.includes(s)) });
  };
  return (
    <ul className="-mx-2 space-y-0.5">
      {categoryFacets.map((f) => {
        const checked = params.cats.includes(f.slug);
        const disabled = !checked && f.count === 0;
        return (
          <li key={f.slug}>
            <label className={cn('flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-2 transition-colors duration-150 hover:bg-brand-alt lg:min-h-[40px]', disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent')}>
              <Checkbox
                checked={checked} disabled={disabled} onCheckedChange={(v) => toggle(f.slug, v === true)}
                className="h-5 w-5 rounded-[6px] border-[1.5px] border-input data-[state=checked]:border-primary [&_svg]:h-3.5 [&_svg]:w-3.5"
              />
              <span className={cn('flex-1 text-[15px]', checked && 'font-semibold')}>{f.name}</span>
              <span className="text-[13px] tabular-nums text-muted-foreground">{f.count}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/** Uma característica (Admin > Especificações) com os seus valores e quantos produtos cada um tem. */
function SpecFacetList({ listing, facet }: { listing: Listing; facet: SpecFacet }) {
  const { locale } = useMessages(catalogMessages);
  const { params, update } = listing;
  const attr = facet.attribute.slug;
  const unit = facet.attribute.unit?.trim();
  return (
    <ul className="-mx-2 space-y-0.5">
      {facet.options.map(({ option, count, checked }) => {
        const disabled = !checked && count === 0;
        return (
          <li key={option.id}>
            <label className={cn('flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-2 transition-colors duration-150 hover:bg-brand-alt lg:min-h-[40px]', disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent')}>
              <Checkbox
                checked={checked} disabled={disabled} onCheckedChange={(v) => update({ specs: toggleSpec(params.specs, attr, option.slug, v === true) })}
                className="h-5 w-5 rounded-[6px] border-[1.5px] border-input data-[state=checked]:border-primary [&_svg]:h-3.5 [&_svg]:w-3.5"
              />
              {option.color && <span className="h-4 w-4 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: option.color }} aria-hidden="true" />}
              <span className={cn('flex-1 text-[15px]', checked && 'font-semibold')}>{specText(option.label_i18n, locale, option.slug)}{unit ? ` ${unit}` : ''}</span>
              <span className="text-[13px] tabular-nums text-muted-foreground">{count}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/** Marcas (Admin > Marcas) com quantos produtos cada uma tem; OU entre as marcas escolhidas. */
function BrandFacetList({ listing }: { listing: Listing }) {
  const { params, update } = listing;
  return (
    <ul className="-mx-2 space-y-0.5">
      {listing.brandFacets.map(({ brand, count }) => {
        const checked = params.brands.includes(brand.slug);
        const disabled = !checked && count === 0;
        return (
          <li key={brand.id}>
            <label className={cn('flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-2 transition-colors duration-150 hover:bg-brand-alt lg:min-h-[40px]', disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent')}>
              <Checkbox
                checked={checked} disabled={disabled} onCheckedChange={(v) => update({ brands: toggleBrand(params.brands, brand.slug, v === true) })}
                className="h-5 w-5 rounded-[6px] border-[1.5px] border-input data-[state=checked]:border-primary [&_svg]:h-3.5 [&_svg]:w-3.5"
              />
              <span className={cn('flex-1 text-[15px]', checked && 'font-semibold')}>{brand.name}</span>
              <span className="text-[13px] tabular-nums text-muted-foreground">{count}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

const stepFor = (span: number) => (span <= 60 ? 1 : span <= 400 ? 5 : span <= 2000 ? 10 : 50);

/** Faixa de preço no preço mostrado ao cliente (com promoção, imposto do país e moeda atual). */
function PriceFilter({ bounds, value, currency, onChange }: { bounds: PriceBounds; value: PriceRange | null; currency: string; onChange: (r: PriceRange | null) => void }) {
  const { t } = useMessages(catalogMessages);
  const money = useMoney(currency);
  const step = stepFor(bounds.max - bounds.min);
  const bMin = Math.floor(bounds.min / step) * step;
  const bMax = Math.max(bMin + step, Math.ceil(bounds.max / step) * step);
  const clamp = (v: number) => Math.min(bMax, Math.max(bMin, v));
  const lo = clamp(value?.min ?? bMin);
  const hi = clamp(value?.max ?? bMax);
  const [draft, setDraft] = useState<[number, number]>([lo, hi]);
  const [inputs, setInputs] = useState<[string, string]>([money.input(lo), money.input(hi)]);
  const minId = useId();
  const maxId = useId();

  useEffect(() => { setDraft([lo, hi]); setInputs([money.input(lo), money.input(hi)]); }, [lo, hi, money]);

  const commit = (a: number, b: number) => {
    const x = clamp(Math.min(a, b));
    const y = clamp(Math.max(a, b));
    const min = x <= bMin ? null : Math.round(x * 100) / 100;
    const max = y >= bMax ? null : Math.round(y * 100) / 100;
    if (min === (value?.min ?? null) && max === (value?.max ?? null)) { setDraft([x, y]); setInputs([money.input(x), money.input(y)]); return; }
    onChange(min === null && max === null ? null : { min, max });
  };
  const commitInputs = () => commit(money.parse(inputs[0]) ?? bMin, money.parse(inputs[1]) ?? bMax);

  if (bounds.max - bounds.min < 1) return <p className="text-sm text-muted-foreground">{t('priceSingle', { value: money.format(bounds.max) })}</p>;

  const thumb = 'relative block h-6 w-6 rounded-full border-2 border-primary bg-white shadow-[var(--shadow-soft)] transition-[transform,box-shadow] duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 after:absolute after:-inset-2.5';
  const field = (id: string, label: string, i: 0 | 1) => (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium text-muted-foreground">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-muted-foreground" aria-hidden="true">{money.symbol}</span>
        <input
          id={id} inputMode="decimal" value={inputs[i]} aria-describedby={`${minId}-hint`}
          onChange={(e) => setInputs((cur) => (i === 0 ? [e.target.value, cur[1]] : [cur[0], e.target.value]))}
          onBlur={commitInputs} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitInputs(); } }}
          className="h-11 w-full rounded-[14px] border border-border bg-white pr-2 text-[15px] tabular-nums outline-none transition-[border-color,box-shadow] duration-150 focus:border-primary focus:shadow-[var(--shadow-ring-royal)]"
          style={{ paddingLeft: `${Math.max(2.25, money.symbol.length * 0.55 + 1.2)}rem` }}
        />
      </div>
    </div>
  );

  return (
    <div>
      <SliderPrimitive.Root
        min={bMin} max={bMax} step={step} minStepsBetweenThumbs={0} value={draft}
        onValueChange={(v) => { setDraft([v[0], v[1]]); setInputs([money.input(v[0]), money.input(v[1])]); }}
        onValueCommit={(v) => commit(v[0], v[1])}
        className="relative mx-3 flex h-11 touch-none select-none items-center"
        aria-label={t('priceSlider')}
      >
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-border">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-primary" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className={thumb} aria-label={t('priceMin')} aria-valuetext={money.format(draft[0])} />
        <SliderPrimitive.Thumb className={thumb} aria-label={t('priceMax')} aria-valuetext={money.format(draft[1])} />
      </SliderPrimitive.Root>
      <div className="mt-2 flex items-end gap-2">
        {field(minId, t('priceMin'), 0)}
        <span className="pb-3 text-muted-foreground" aria-hidden="true">-</span>
        {field(maxId, t('priceMax'), 1)}
      </div>
      <p id={`${minId}-hint`} className="mt-2 text-[12px] leading-snug text-muted-foreground">{t('priceHint', { currency: money.name })}</p>
    </div>
  );
}

/** Interruptor "Apenas ofertas" (?promo=1) com quantas ofertas há no conjunto atual. */
function OffersToggle({ listing }: { listing: Listing }) {
  const { t } = useMessages(catalogMessages);
  const id = useId();
  return (
    <div className="border-t border-border py-3">
      <label htmlFor={id} className="flex min-h-[44px] cursor-pointer items-center justify-between gap-4">
        <span>
          <span className="block text-[15px] font-semibold">{t('offersOnly')}</span>
          <span className="block text-[13px] text-muted-foreground">{t('offersOnlyHint')} <span className="tabular-nums">({listing.offers})</span></span>
        </span>
        <Switch id={id} checked={listing.params.promo} onCheckedChange={(v) => listing.update({ promo: v })} />
      </label>
    </div>
  );
}

/** Painel de filtros (coluna lateral no desktop e conteúdo do drawer no celular). */
export function FilterPanel({ listing }: { listing: Listing }) {
  const { t, locale } = useMessages(catalogMessages);
  return (
    <div>
      <div className="pb-3"><SearchField listing={listing} /></div>
      <OffersToggle listing={listing} />
      {listing.scope.kind === 'all' && <Section title={t('category')}><CategoryFacet listing={listing} /></Section>}
      {listing.bounds && (
        <Section title={t('price')}>
          <PriceFilter bounds={listing.bounds} value={listing.price} currency={listing.currency} onChange={listing.setPrice} />
        </Section>
      )}
      {listing.brandFacets.length > 0 && <Section title={t('brand')}><BrandFacetList listing={listing} /></Section>}
      {listing.specFacets.map((f) => (
        <Section key={f.attribute.id} title={specText(f.attribute.name_i18n, locale, f.attribute.slug)}>
          <SpecFacetList listing={listing} facet={f} />
        </Section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Filtros ativos                                                      */
/* ------------------------------------------------------------------ */

export function ActiveFilters({ listing }: { listing: Listing }) {
  const { t, locale } = useMessages(catalogMessages);
  const menu = useCatalogMenu();
  const priceLabel = usePriceLabel(listing.currency);
  const { params, update, price } = listing;
  const chips: { id: string; label: string; remove: () => void }[] = [];
  if (params.q) chips.push({ id: 'q', label: t('chipSearch', { q: params.q }), remove: () => update({ q: '' }) });
  for (const slug of params.cats) {
    const c = menu.find((x) => x.slug === slug);
    if (c) chips.push({ id: `cat-${slug}`, label: c.name, remove: () => update({ cats: params.cats.filter((s) => s !== slug) }) });
  }
  if (price) chips.push({ id: 'price', label: priceLabel(price), remove: () => listing.setPrice(null) });
  if (params.promo) chips.push({ id: 'promo', label: t('offersOnly'), remove: () => update({ promo: false }) });
  for (const [attrSlug, vals] of Object.entries(params.specs)) {
    const attr = listing.specAttributes.find((a) => a.slug === attrSlug);
    if (!attr) continue;
    for (const v of vals) {
      const opt = attr.options.find((o) => o.slug === v);
      if (!opt) continue;
      const label = `${specText(attr.name_i18n, locale, attr.slug)}: ${specText(opt.label_i18n, locale, opt.slug)}`;
      chips.push({ id: `spec-${attrSlug}-${v}`, label, remove: () => update({ specs: toggleSpec(params.specs, attrSlug, v, false) }) });
    }
  }
  for (const slug of params.brands) {
    const b = listing.brands.find((x) => x.slug === slug);
    if (b) chips.push({ id: `brand-${slug}`, label: t('brand_chip', { brand: b.name }), remove: () => update({ brands: toggleBrand(params.brands, slug, false) }) });
  }
  if (!chips.length) return null;
  return (
    <div role="group" aria-label={t('activeFilters')} className="flex flex-wrap items-center gap-2">
      <AnimatePresence initial={false}>
        {chips.map((c) => (
          <motion.button
            key={c.id} type="button" layout onClick={c.remove} aria-label={t('removeFilter', { name: c.label })}
            initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={{ duration: 0.15 }}
            className="inline-flex min-h-[44px] max-w-full items-center md:min-h-[36px] gap-1.5 rounded-xl border border-primary/30 bg-brand-orange-soft py-1 pl-3 pr-2 text-[13px] font-semibold text-brand-orange-text transition-colors duration-150 hover:border-primary"
          >
            <span className="truncate">{c.label}</span>
            <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
          </motion.button>
        ))}
      </AnimatePresence>
      {chips.length > 1 && (
        <button type="button" onClick={listing.clearFilters} className="min-h-[44px] rounded-lg px-2 text-[13px] md:min-h-[36px] font-semibold text-foreground underline-offset-4 transition-colors hover:text-brand-orange-text hover:underline">
          {t('clearAll')}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Drawer do celular                                                   */
/* ------------------------------------------------------------------ */

export function FilterSheet({ listing, open, onOpenChange, onDone }: { listing: Listing; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const { t } = useMessages(catalogMessages);
  const n = listing.results.length;
  const show = n === 0 ? t('showResults_zero') : n === 1 ? t('showResults_one') : t('showResults_other', { count: n });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[min(92vw,420px)] flex-col gap-0 border-l border-border bg-white p-0 sm:max-w-[420px] [&>button]:hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div>
            <SheetTitle className="text-[19px] font-bold tracking-[-0.02em]">{t('filters')}</SheetTitle>
            <SheetDescription className="text-[13px] text-muted-foreground">{t(countKey(n), { count: n })}</SheetDescription>
          </div>
          <SheetClose asChild>
            <button type="button" aria-label={t('closeFilters')} className="grid h-11 w-11 place-items-center rounded-xl text-foreground transition-colors hover:bg-secondary">
              <X className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            </button>
          </SheetClose>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <FilterPanel listing={listing} />
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-3 border-t border-border bg-white px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <button type="button" onClick={listing.clearFilters} disabled={listing.activeCount === 0} className={cn(btnSecondary, 'px-4 disabled:opacity-50')}>{t('clearAll')}</button>
          <button type="button" onClick={onDone} className={btnPrimary}>{show}</button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
