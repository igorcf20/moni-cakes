import { useId } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownUp, SlidersHorizontal } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMessages } from '@/i18n';
import { catalogMessages, type CatalogMessages } from '@/i18n/catalog';
import { cn } from '@/lib/utils';
import { SORTS, type SortKey } from './listing';
import type { Listing } from './useListing';

const LABEL: Record<Exclude<SortKey, 'relevancia'>, keyof CatalogMessages> = {
  'mais-vendidos': 'sort_best',
  novidades: 'sort_new',
  'menor-preco': 'sort_price_asc',
  'maior-preco': 'sort_price_desc',
};

/** Barra de ordenação (?ordem=): botões no tablet e desktop, lista no celular. */
function SortControl({ listing }: { listing: Listing }) {
  const { t } = useMessages(catalogMessages);
  const { params, update } = listing;
  const label = (s: SortKey) => (s === 'relevancia' ? t(params.q ? 'sort_relevance' : 'sort_featured') : t(LABEL[s]));
  const set = (s: SortKey) => { if (s !== params.sort) update({ sort: s }); };
  const labelId = useId();
  return (
    <>
      <div className="min-w-0 flex-1 md:hidden">
        <Select value={params.sort} onValueChange={(v) => set(v as SortKey)}>
          <SelectTrigger aria-label={t('sortLabel')} className="h-11 w-full rounded-full border-border bg-white px-4 text-[14px] font-medium focus:ring-offset-0">
            <ArrowDownUp className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
            <span className="min-w-0 flex-1 text-left"><SelectValue /></span>
          </SelectTrigger>
          <SelectContent className="rounded-[14px] border-border bg-white p-1 shadow-[var(--shadow-elevated)]">
            {SORTS.map((s) => (
              <SelectItem key={s} value={s} className="min-h-[44px] rounded-[10px] text-[15px] focus:bg-brand-orange-soft focus:text-brand-orange-text">{label(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="hidden min-w-0 items-center gap-3 md:flex">
        <span id={labelId} className="sr-only shrink-0 text-[14px] font-medium text-muted-foreground xl:not-sr-only">{t('sortLabel')}</span>
        <div role="group" aria-labelledby={labelId} className="flex min-w-0 gap-1 overflow-x-auto rounded-full border border-border bg-white p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SORTS.map((s) => {
            const active = params.sort === s;
            return (
              <button
                key={s} type="button" aria-pressed={active} onClick={() => set(s)}
                className={cn('relative h-10 shrink-0 whitespace-nowrap rounded-full px-4 text-[14px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'text-white' : 'text-brand-ink-soft hover:text-foreground')}
              >
                {active && <motion.span layoutId="catalog-sort-active" className="absolute inset-0 rounded-full bg-brand-ink" transition={{ duration: 0.2 }} aria-hidden="true" />}
                <span className="relative">{label(s)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** Barra acima da grade: botão Filtrar (abre o painel; no computador só com os filtros em botão) e ordenação. */
export function CatalogToolbar({ listing, onOpenFilters, filtersButton = false }: { listing: Listing; onOpenFilters: () => void; filtersButton?: boolean }) {
  const { t } = useMessages(catalogMessages);
  const n = listing.activeCount;
  return (
    <div className={cn('flex items-center gap-3', filtersButton ? 'lg:justify-between' : 'lg:justify-end')}>
      <button
        type="button" onClick={onOpenFilters} aria-haspopup="dialog"
        aria-label={n ? `${t('filter')}, ${n === 1 ? t('filtersActive_one') : t('filtersActive_other', { count: n })}` : t('filter')}
        className={cn('inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-white px-4 text-[14px] font-medium text-foreground transition-colors duration-150 hover:border-foreground/40', !filtersButton && 'lg:hidden')}
      >
        <SlidersHorizontal className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
        {t('filter')}
        {n > 0 && <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold tabular-nums text-primary-foreground" aria-hidden="true">{n}</span>}
      </button>
      <SortControl listing={listing} />
    </div>
  );
}
