// /comparar (recurso compare): até 4 produtos lado a lado. Uma coluna por produto, a primeira coluna (rótulos) fica
// fixa ao rolar para o lado no celular. Linhas: preço, avaliação, disponibilidade, marca, categoria, cores, tamanhos e
// especificações (Admin > Especificações + ficha do produto). "Mostrar só diferenças" esconde as linhas iguais.
// Lista em src/lib/compare.ts; dados em useCompareProducts.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { AlertCircle, Check, GitCompareArrows, Minus, Plus, RefreshCw, ShoppingBag, SlidersHorizontal, X } from 'lucide-react';
import { PageIntro, PageShell, StatusCard } from '@/components/institutional/ui';
import { btnPrimary, card } from '@/components/institutional/styles';
import { LayerArt } from '@/components/MediaImage';
import { LowestPrice } from '@/components/product/ProductCard3D';
import { RatingStars } from '@/components/product/RatingStars';
import { specRows } from '@/components/product/ProductDetailsTabs';
import { Switch } from '@/components/ui/switch';
import { useStoreName } from '@/hooks/useBrand';
import { useBrands } from '@/hooks/useBrands';
import { useCatalogMenu } from '@/hooks/useCatalogMenu';
import { useCompareProducts, type CompareProduct, type CompareStock } from '@/hooks/useCompareProducts';
import { useFeature } from '@/hooks/useFeatures';
import { useQuickAdd } from '@/hooks/useQuickAdd';
import { useSpecAttributes } from '@/hooks/useProductSpecs';
import { useMessages } from '@/i18n';
import { compareMessages } from '@/i18n/compare';
import { productMessages } from '@/i18n/product';
import { COMPARE_LIMIT, allEqual, useCompare } from '@/lib/compare';
import { productSpecRows, specText } from '@/lib/productSpecs';
import { cn } from '@/lib/utils';

type Row = { key: string; label: string; values: string[]; cells: ReactNode[] };

const labelCol = 'sticky left-0 z-10 w-[108px] min-w-[108px] bg-white px-3 text-left align-top text-[13px] font-semibold text-brand-ink-soft sm:w-[180px] sm:min-w-[180px] sm:px-5 sm:text-[14px]';
const valueCol = 'min-w-[152px] px-3 align-top text-[14px] text-foreground sm:min-w-[200px] sm:px-5 sm:text-[15px]';

function Empty({ label }: { label: string }) {
  return <span className="inline-flex items-center text-muted-foreground"><Minus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /><span className="sr-only">{label}</span></span>;
}

function StockBadge({ stock }: { stock: CompareStock }) {
  const { t } = useMessages(compareMessages);
  const text = stock.kind === 'in' ? t('stockIn')
    : stock.kind === 'low' ? (stock.count === 1 ? t('stockLowOne') : t('stockLowOther', { count: stock.count ?? 0 }))
    : stock.kind === 'out' ? t('stockOut')
    : stock.kind === 'made' ? t('stockMade') : t('stockPreorder');
  const tone = stock.kind === 'in' ? 'bg-emerald-50 text-emerald-700'
    : stock.kind === 'out' ? 'bg-brand-alt text-brand-ink-soft'
    : 'bg-accent text-brand-orange-text';
  return <span className={cn('inline-flex rounded-lg px-2 py-1 text-[13px] font-semibold', tone)}>{text}</span>;
}

/** Botão do carrinho de uma coluna: sem opções vai direto; com opções leva à página do produto. */
function ColumnCart({ p }: { p: CompareProduct }) {
  const { t } = useMessages(compareMessages);
  const quickAdd = useQuickAdd();
  const [state, setState] = useState<'idle' | 'adding' | 'done'>('idle');
  const base = 'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[14px] px-3 text-[14px] font-semibold transition-[background-color,border-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
  if (p.stock.kind === 'out') {
    return <span className={cn(base, 'cursor-not-allowed border border-border bg-brand-alt text-muted-foreground')} aria-disabled="true">{t('stockOut')}</span>;
  }
  if (p.needsOptions) {
    return (
      <Link to={p.href} className={cn(base, 'border border-border bg-white text-foreground hover:border-primary hover:text-brand-orange-text')}>
        <SlidersHorizontal className="h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" /><span className="truncate">{t('chooseOptions')}</span>
      </Link>
    );
  }
  const add = async () => {
    if (state !== 'idle') return;
    setState('adding');
    try {
      await quickAdd(p.id);
      setState('done');
      toast.success(t('added'), { description: p.name });
      window.setTimeout(() => setState('idle'), 1400);
    } catch {
      setState('idle');
      toast.error(t('addError'));
    }
  };
  return (
    <button type="button" onClick={() => void add()} aria-busy={state === 'adding'}
      className={cn(base, 'text-primary-foreground active:scale-[0.98]', state === 'done' ? 'bg-emerald-600' : 'bg-primary hover:bg-primary-hover')}>
      {state === 'done' ? <Check className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" /> : <ShoppingBag className="h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />}
      <span className="truncate">{state === 'done' ? t('added') : t('addToCart')}</span>
    </button>
  );
}

function TableSkeleton({ cols }: { cols: number }) {
  const { t } = useMessages(compareMessages);
  return (
    <div className={cn(card, 'overflow-hidden p-4 sm:p-6')} role="status" aria-label={t('loading')}>
      <div className="flex gap-4">
        <div className="hidden w-[160px] shrink-0 sm:block" />
        {Array.from({ length: cols }, (_, i) => (
          <div key={i} className="min-w-0 flex-1 space-y-3">
            <div className="skeleton aspect-square rounded-[14px]" />
            <div className="skeleton h-4 w-4/5 rounded" />
            <div className="skeleton h-11 rounded-[14px]" />
          </div>
        ))}
      </div>
      <div className="mt-6 space-y-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-5 rounded" />)}</div>
    </div>
  );
}

const Compare = () => {
  const { t, locale } = useMessages(compareMessages);
  const { t: tp } = useMessages(productMessages);
  const store = useStoreName();
  const ids = useCompare((s) => s.ids);
  const remove = useCompare((s) => s.remove);
  const clear = useCompare((s) => s.clear);
  const { items, isLoading, isError, loaded, refetch } = useCompareProducts(ids);
  const brandsOn = useFeature('brands');
  const specsOn = useFeature('spec_filters');
  const { data: brands = [] } = useBrands(brandsOn);
  const { data: attributes = [] } = useSpecAttributes(specsOn);
  const menu = useCatalogMenu();
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [missing, setMissing] = useState(false);

  // Produto que já não está ativo sai da lista (e o cliente fica a saber).
  useEffect(() => {
    if (!loaded) return;
    const found = new Set(items.map((p) => p.id));
    const gone = ids.filter((id) => !found.has(id));
    if (!gone.length) return;
    gone.forEach(remove);
    setMissing(true);
  }, [loaded, items, ids, remove]);

  const rows = useMemo(() => {
    const none = t('notInformed');
    const cell = (v: string) => (v ? v : <Empty label={none} />);
    const summary: Row[] = [];
    summary.push({
      key: 'price', label: t('rowPrice'), values: items.map((p) => p.price),
      cells: items.map((p) => (
        <span key={p.id} className="flex flex-col leading-tight">
          {p.oldPrice && <span className="text-[13px] text-muted-foreground line-through tabular-nums">{p.oldPrice}</span>}
          <span className="flex flex-wrap items-center gap-2">
            <span className={cn('text-[17px] font-bold tabular-nums', p.oldPrice ? 'text-brand-orange-text' : 'text-foreground')}>{p.price}</span>
            {!!p.discountPct && <span className="rounded-lg bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">-{p.discountPct}%</span>}
          </span>
          {p.oldPrice && <LowestPrice id={p.id} vatRate={p.vatRate} />}
        </span>
      )),
    });
    summary.push({
      key: 'rating', label: t('rowRating'), values: items.map((p) => (p.reviews ? `${p.rating.toFixed(1)}/${p.reviews}` : '')),
      cells: items.map((p) => (p.reviews ? (
        <span key={p.id} className="flex flex-col gap-1">
          <RatingStars value={p.rating} size="sm" />
          <span className="text-[13px] text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">{t('ratingOf', { rating: p.rating.toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) })}</span>
            {' · '}{p.reviews === 1 ? t('reviewsOne') : t('reviewsOther', { count: p.reviews })}
          </span>
        </span>
      ) : <span key={p.id} className="text-[14px] text-muted-foreground">{t('noReviews')}</span>)),
    });
    summary.push({ key: 'stock', label: t('rowStock'), values: items.map((p) => `${p.stock.kind}${p.stock.count ?? ''}`), cells: items.map((p) => <StockBadge key={p.id} stock={p.stock} />) });
    if (brandsOn) {
      const name = (id: string | null) => (id ? brands.find((b) => b.id === id)?.name ?? '' : '');
      summary.push({ key: 'brand', label: t('rowBrand'), values: items.map((p) => name(p.brandId)), cells: items.map((p) => cell(name(p.brandId))) });
    }
    // products.category guarda o slug ou o nome da categoria: mostra o nome do menu no idioma atual.
    const norm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const catName = (v: string) => {
      const k = norm(v);
      const c = k ? menu.find((m) => norm(m.slug) === k || norm(m.name) === k || m.labels.some((l) => norm(l) === k)) : undefined;
      return c?.name ?? v;
    };
    summary.push({ key: 'category', label: t('rowCategory'), values: items.map((p) => catName(p.category)), cells: items.map((p) => cell(catName(p.category))) });
    summary.push({
      key: 'colors', label: t('rowColors'), values: items.map((p) => p.colors.map((c) => c.name).join(', ')),
      cells: items.map((p) => (p.colors.length ? (
        <ul key={p.id} className="flex flex-wrap gap-x-3 gap-y-1.5">
          {p.colors.map((c) => (
            <li key={c.name} className="inline-flex items-center gap-1.5 text-[14px]">
              {c.hex && <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: c.hex }} aria-hidden="true" />}{c.name}
            </li>
          ))}
        </ul>
      ) : <Empty key={p.id} label={none} />)),
    });
    summary.push({ key: 'sizes', label: t('rowSizes'), values: items.map((p) => p.sizes.join(', ')), cells: items.map((p) => cell(p.sizes.join(', '))) });

    // Especificações: as do Admin > Especificações primeiro (pela ordem de lá), depois a ficha de cada produto.
    const order: string[] = [];
    const labels = new Map<string, string>();
    const perProduct = items.map((p) => {
      const structured = specsOn ? productSpecRows(p.specOptionIds, attributes, locale) : [];
      const seen = new Set(structured.map((r) => r.label.toLowerCase()));
      const all = [...structured, ...specRows(p.product, tp, locale).filter((r) => !seen.has(r.label.toLowerCase()))];
      const map = new Map<string, string>();
      for (const r of all) {
        const k = r.label.toLowerCase();
        if (!labels.has(k)) { labels.set(k, r.label); order.push(k); }
        map.set(k, r.value);
      }
      return map;
    });
    const attrOrder = new Map(attributes.map((a, i) => [specText(a.name_i18n, locale, a.slug).toLowerCase(), i]));
    order.sort((a, b) => (attrOrder.get(a) ?? 999) - (attrOrder.get(b) ?? 999));
    const specs: Row[] = order.map((k) => {
      const values = perProduct.map((m) => m.get(k) ?? '');
      return { key: `spec:${k}`, label: labels.get(k) ?? k, values, cells: values.map(cell) };
    });

    const keep = (r: Row) => r.values.some((v) => v) && (!onlyDiff || items.length < 2 || !allEqual(r.values));
    return { summary: summary.filter(keep), specs: specs.filter(keep), total: summary.length + specs.length };
  }, [items, t, tp, locale, brandsOn, brands, specsOn, attributes, onlyDiff, menu]);

  const n = ids.length;
  const noDiff = onlyDiff && items.length > 1 && !rows.summary.length && !rows.specs.length;

  return (
    <PageShell>
      <Helmet>
        <title>{t('metaTitle', { store })}</title>
        <meta name="description" content={t('metaDesc')} />
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <div className="shell">
        <PageIntro
          crumbs={[{ label: t('home'), href: '/' }, { label: t('products'), href: '/produtos' }, { label: t('title') }]}
          kicker={t('eyebrow')} title={t('title')} lead={t('lead', { max: COMPARE_LIMIT })}
        />

        <div className="mt-8 md:mt-10">
          {n === 0 ? (
            <StatusCard Icon={GitCompareArrows} title={t('emptyTitle')} text={t('emptyText', { max: COMPARE_LIMIT })} headingLevel={2}>
              <Link to="/produtos" className={btnPrimary}>{t('browse')}</Link>
            </StatusCard>
          ) : isLoading ? (
            <TableSkeleton cols={Math.min(n, 4)} />
          ) : isError ? (
            <StatusCard Icon={AlertCircle} tone="error" title={t('error')} headingLevel={2}>
              <button type="button" onClick={refetch} className={btnPrimary}><RefreshCw className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />{t('retry')}</button>
            </StatusCard>
          ) : (
            <>
              {/* Barra de ferramentas */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <label className={cn('flex min-h-[44px] cursor-pointer items-center gap-3 text-[15px] font-semibold', items.length < 2 && 'cursor-not-allowed opacity-50')}>
                  <Switch checked={onlyDiff} onCheckedChange={setOnlyDiff} disabled={items.length < 2} />
                  {t('onlyDiff')}
                </label>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {n < COMPARE_LIMIT && (
                    <Link to="/produtos" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-[14px] font-semibold text-brand-orange-text transition-colors duration-150 hover:bg-accent">
                      <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{t('addMore')}
                    </Link>
                  )}
                  <button type="button" onClick={clear} aria-label={t('clearAria')} className="inline-flex min-h-[44px] items-center rounded-xl px-3 text-[14px] font-semibold text-muted-foreground transition-colors duration-150 hover:text-foreground">
                    {t('clear')}
                  </button>
                </div>
              </div>

              {missing && <p className="mt-3 rounded-xl bg-brand-alt px-4 py-2.5 text-[14px] text-brand-ink-soft" role="status">{t('missing')}</p>}
              {items.length === 1 && <p className="mt-3 rounded-xl bg-accent px-4 py-2.5 text-[14px] font-medium text-brand-orange-text" role="status">{t('oneHint')}</p>}
              {items.length > 1 && <p className="mt-3 text-[13px] text-muted-foreground sm:hidden">{t('swipe')}</p>}

              <div className={cn(card, 'mt-4 overflow-x-auto overscroll-x-contain')}>
                <table className="w-full border-separate border-spacing-0">
                  <caption className="sr-only">{t('tableCaption')}</caption>
                  <thead>
                    <tr>
                      <td className={cn(labelCol, 'rounded-tl-[20px] py-4')} />
                        {items.map((p) => (
                          <motion.th key={p.id} scope="col" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                            className={cn(valueCol, 'py-4 text-left font-normal')}>
                            <div className="relative max-w-[240px]">
                              <Link to={p.href} className="block aspect-square overflow-hidden rounded-[14px] bg-background" tabIndex={-1} aria-hidden="true">
                                {p.image ? <img src={p.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-200 hover:scale-[1.03]" /> : <LayerArt Icon={ShoppingBag} size="sm" />}
                              </Link>
                              <button type="button" onClick={() => remove(p.id)} aria-label={t('removeColumnAria', { name: p.name })} title={t('removeColumn')}
                                className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-foreground shadow-[var(--shadow-soft)] transition-[background-color,color,transform] duration-150 hover:bg-primary hover:text-primary-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                              </button>
                            </div>
                            <Link to={p.href} className="mt-3 line-clamp-3 min-h-[3.9em] max-w-[240px] text-[14px] font-semibold leading-snug text-foreground transition-colors duration-150 hover:text-brand-orange-text sm:text-[15px]">{p.name}</Link>
                            <div className="mt-3 max-w-[240px]"><ColumnCart p={p} /></div>
                          </motion.th>
                        ))}
                    </tr>
                  </thead>
                  {([['summary', t('groupSummary'), rows.summary], ['specs', t('groupSpecs'), rows.specs]] as const).map(([key, title, list]) => list.length > 0 && (
                    <tbody key={key}>
                      <tr>
                        <th scope="colgroup" colSpan={items.length + 1} className="border-t border-brand-card-border bg-brand-alt/60 px-3 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-orange-text sm:px-5">
                          <span className="sticky left-3 sm:left-5">{title}</span>
                        </th>
                      </tr>
                      {list.map((r) => (
                        <tr key={r.key} className="group">
                          <th scope="row" className={cn(labelCol, 'border-t border-brand-card-border py-3.5 transition-colors duration-150 group-hover:bg-background')}>{r.label}</th>
                          {r.cells.map((c, i) => (
                            <td key={items[i]?.id ?? i} className={cn(valueCol, 'border-t border-brand-card-border py-3.5 transition-colors duration-150 group-hover:bg-background/60')}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
                {noDiff && <p className="border-t border-brand-card-border px-5 py-6 text-center text-[15px] text-muted-foreground">{t('noDiff')}</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
};

export default Compare;
