// =====================================================================================
// /avaliacoes (recurso store_reviews): avaliações aprovadas da loja (home_section_items "testimonial") e dos produtos
// (product_reviews), lidas pela função store_reviews_public (só colunas seguras, nome abreviado).
// Duas abas (loja, produtos), resumo com nota média e barras por estrelas, lista com "Ver mais".
// =====================================================================================
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { useInfiniteQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BadgeCheck, Loader2, MessageSquareQuote, PenLine, Star, Store } from 'lucide-react';
import { PageShell, PageIntro } from '@/components/institutional/ui';
import { btnPrimary, btnSecondary, card, reveal } from '@/components/institutional/styles';
import { supabase } from '@/integrations/supabase/client';
import { useStoreName } from '@/hooks/useBrand';
import { useMessages } from '@/i18n';
import { storeReviewsMessages } from '@/i18n/storeReviews';
import { cn } from '@/lib/utils';

type Kind = 'store' | 'products';
type Summary = { count: number; average: number | null; dist: number[] };
type Item = {
  id: string; rating: number; title: string | null; body: string | null; created_at: string; author: string | null;
  author_role?: string | null; author_location?: string | null; verified?: boolean; admin_reply?: string | null;
  product_id?: string; product_name?: string; product_slug?: string | null; product_image?: string | null;
};
type Page = { enabled: boolean; store?: Summary; products?: Summary; items?: Item[] };

const PAGE = 12;

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn('h-4 w-4', n <= Math.round(value) ? 'fill-primary text-primary' : 'fill-muted text-muted')} strokeWidth={1.6} />
      ))}
    </span>
  );
}

export default function StoreReviews() {
  const { t, locale } = useMessages(storeReviewsMessages);
  const storeName = useStoreName();
  const [kind, setKind] = useState<Kind>('store');

  const q = useInfiniteQuery({
    queryKey: ['store-reviews-public', kind],
    initialPageParam: 0,
    staleTime: 60_000,
    queryFn: async ({ pageParam }): Promise<Page> => {
      const { data, error } = await (supabase as any).rpc('store_reviews_public', { _kind: kind, _limit: PAGE, _offset: pageParam });
      if (error) throw error;
      return data as Page;
    },
    getNextPageParam: (last, all) => ((last.items?.length ?? 0) < PAGE ? undefined : all.length * PAGE),
  });

  const first = q.data?.pages[0];
  const items = q.data?.pages.flatMap((p) => p.items ?? []) ?? [];
  const summaries = { store: first?.store, products: first?.products };
  const summary = summaries[kind];
  const num = (v: number, d = 1) => new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
  const countLabel = (n: number) => (n === 1 ? t('count_one', { count: n }) : t('count_other', { count: num(n, 0) }));

  return (
    <PageShell>
      <Helmet>
        <title>{`${t('seo_title')} | ${storeName}`}</title>
        <meta name="description" content={t('seo_desc', { name: storeName })} />
      </Helmet>
      <div className="shell">
        <PageIntro
          crumbs={[{ label: t('home'), href: '/' }, { label: t('crumb') }]}
          kicker={t('kicker')}
          title={t('title')}
          lead={t('lead', { name: storeName })}
        />

        {/* Abas: loja e produtos, com a contagem de cada uma */}
        <div role="group" aria-label={t('tabs_label')} className="mt-8 inline-flex rounded-[14px] border border-brand-card-border bg-white p-1">
          {(['store', 'products'] as const).map((k) => {
            const on = k === kind;
            const n = summaries[k]?.count;
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => setKind(k)}
                className={cn('relative flex min-h-11 items-center gap-2 rounded-[11px] px-4 text-[15px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  on ? 'text-primary-foreground' : 'text-brand-ink-soft hover:text-foreground')}>
                {on && <motion.span layoutId="reviews-tab" className="absolute inset-0 rounded-[11px] bg-primary" transition={{ duration: 0.2 }} />}
                <span className="relative">{k === 'store' ? t('tab_store') : t('tab_products')}</span>
                {n != null && <span className={cn('relative rounded-full px-2 py-0.5 text-[12px]', on ? 'bg-white/20' : 'bg-brand-alt')}>{num(n, 0)}</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
          {/* Resumo: média, barras por estrelas e convite para avaliar a loja */}
          <aside className={cn(card, 'p-6 lg:sticky lg:top-28')}>
            {q.isLoading ? (
              <div className="space-y-3" aria-hidden="true">
                <div className="skeleton h-14 w-32 rounded-xl" />
                {Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-3 rounded-full" />)}
              </div>
            ) : (
              <>
                <div className="flex items-end gap-3">
                  <span className="text-[56px] font-[800] leading-none tracking-[-0.04em]">{summary?.average ? num(summary.average) : num(0)}</span>
                  <span className="pb-1.5 text-[15px] text-brand-ink-soft">{t('average_of')}</span>
                </div>
                <Stars value={summary?.average ?? 0} className="mt-3" />
                <p className="mt-2 text-[14px] text-brand-ink-soft">{countLabel(summary?.count ?? 0)}</p>
                <ul className="mt-5 space-y-2">
                  {[5, 4, 3, 2, 1].map((n, i) => {
                    const c = summary?.dist?.[i] ?? 0;
                    const pct = summary?.count ? (c / summary.count) * 100 : 0;
                    return (
                      <li key={n} className="flex items-center gap-3 text-[13px]">
                        <span className="w-16 shrink-0 text-brand-ink-soft">{n === 1 ? t('stars_row_one') : t('stars_row', { n })}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-brand-alt">
                          <motion.span className="block h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.25 }} />
                        </span>
                        <span className="w-8 shrink-0 text-right tabular-nums text-brand-ink-soft">{num(c, 0)}</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <div className="mt-6 border-t border-brand-card-border pt-5">
              <p className="text-[14px] text-brand-ink-soft">{t('write_hint')}</p>
              <Link to="/deixar-avaliacao" className={cn(btnPrimary, 'mt-3 w-full')}>
                <PenLine className="h-4 w-4" aria-hidden="true" />{t('write_store')}
              </Link>
            </div>
          </aside>

          {/* Lista */}
          <section aria-live="polite" aria-busy={q.isFetching}>
            {q.isLoading ? (
              <ul className="grid gap-4 md:grid-cols-2" aria-label={t('loading')}>
                {Array.from({ length: 4 }, (_, i) => <li key={i} className="skeleton h-[180px] rounded-[20px]" />)}
              </ul>
            ) : q.isError ? (
              <div className={cn(card, 'p-8 text-center')}>
                <p className="text-brand-ink-soft">{t('error')}</p>
                <button type="button" className={cn(btnSecondary, 'mt-4')} onClick={() => q.refetch()}>{t('retry')}</button>
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-brand-card-border p-10 text-center">
                <MessageSquareQuote className="mx-auto h-10 w-10 text-primary" strokeWidth={1.6} aria-hidden="true" />
                <p className="mt-4 text-[17px] font-semibold">{kind === 'store' ? t('empty_store') : t('empty_products')}</p>
                <p className="mt-1 text-brand-ink-soft">{t('empty_hint')}</p>
              </div>
            ) : (
              <>
                <ul className="grid gap-4 md:grid-cols-2">
                  {items.map((r, i) => (
                    <motion.li key={r.id} {...reveal(i % PAGE)} className={cn(card, 'flex flex-col p-5')}>
                      {r.product_name && (
                        <Link to={`/produto/${r.product_slug || r.product_id}`} className="group mb-4 flex items-center gap-3 rounded-[14px] bg-brand-alt p-2 pr-3 transition-colors duration-150 hover:bg-accent">
                          {r.product_image
                            ? <img src={r.product_image} alt="" className="h-12 w-12 shrink-0 rounded-[10px] object-cover" loading="lazy" />
                            : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[10px] bg-white"><Store className="h-5 w-5 text-primary" aria-hidden="true" /></span>}
                          <span className="min-w-0">
                            <span className="block truncate text-[14px] font-semibold">{r.product_name}</span>
                            <span className="text-[12px] font-medium text-brand-orange-text group-hover:underline">{t('see_product')}</span>
                          </span>
                        </Link>
                      )}
                      <div className="flex items-center justify-between gap-3">
                        <Stars value={r.rating} />
                        <span className="sr-only">{t('rating_label', { n: r.rating })}</span>
                        <time dateTime={r.created_at} className="text-[12px] text-muted-foreground">{date(r.created_at)}</time>
                      </div>
                      {r.title && <h2 className="mt-3 text-[16px] font-bold leading-snug">{r.title}</h2>}
                      {r.body && <p className="mt-2 flex-1 whitespace-pre-line text-[15px] leading-relaxed text-foreground/85">{r.body}</p>}
                      {r.admin_reply && (
                        <div className="mt-4 rounded-[14px] bg-brand-orange-soft/60 p-3 text-[14px]">
                          <p className="text-[12px] font-semibold text-brand-orange-text">{t('store_reply')}</p>
                          <p className="mt-1 text-brand-ink-soft">{r.admin_reply}</p>
                        </div>
                      )}
                      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-brand-card-border pt-3 text-[13px]">
                        <span className="font-semibold">{r.author || t('anonymous')}</span>
                        {(r.author_location || r.author_role) && (
                          <span className="text-muted-foreground">{[r.author_role, r.author_location].filter(Boolean).join(', ')}</span>
                        )}
                        {r.verified && (
                          <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700">
                            <BadgeCheck className="h-4 w-4" aria-hidden="true" />{t('verified')}
                          </span>
                        )}
                      </div>
                    </motion.li>
                  ))}
                </ul>
                {q.hasNextPage && (
                  <div className="mt-6 flex justify-center">
                    <button type="button" className={btnSecondary} onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
                      {q.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t('load_more')}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </PageShell>
  );
}
