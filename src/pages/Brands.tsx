// /marcas: todas as marcas ativas (Admin > Marcas, recurso brands), com logo e quantos produtos cada uma tem.
// Cada marca abre /produtos?marca=<slug>, a listagem com o filtro da marca (logo, descrição e site no topo).
// /marca/<slug> leva ao mesmo endereço (BrandRedirect).
import { Link, Navigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { ListingShell } from '@/components/catalog/CatalogLayout';
import { CatalogBreadcrumb } from '@/components/catalog/CatalogBreadcrumb';
import { useBrands } from '@/hooks/useBrands';
import { useStoreName } from '@/hooks/useBrand';
import { brandDescription, SLUG_RE } from '@/lib/brands';
import { useMessages } from '@/i18n';
import { catalogMessages } from '@/i18n/catalog';

function useBrandCounts() {
  return useQuery({
    queryKey: ['brand-counts'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await (supabase as any).from('products').select('brand_id').eq('is_active', true).not('brand_id', 'is', null).limit(20000);
      const counts = new Map<string, number>();
      if (error) return counts;
      for (const r of data ?? []) counts.set(String(r.brand_id), (counts.get(String(r.brand_id)) ?? 0) + 1);
      return counts;
    },
  });
}

export default function Brands() {
  const { t, locale } = useMessages(catalogMessages);
  const storeName = useStoreName();
  const { data: brands = [], isLoading } = useBrands();
  const { data: counts } = useBrandCounts();
  const shown = brands.filter((b) => !counts || (counts.get(b.id) ?? 0) > 0);

  return (
    <ListingShell>
      <Helmet>
        <title>{`${t('brands')} | ${storeName}`}</title>
        <meta name="description" content={t('brands_lead')} />
      </Helmet>
      <CatalogBreadcrumb items={[{ label: t('home'), href: '/' }, { label: t('products'), href: '/produtos' }, { label: t('brands') }]} />
      <h1 className="mt-4 text-[40px] font-[780] leading-[1.04] tracking-[-0.04em] sm:text-[52px] lg:text-[60px]">{t('brands')}</h1>
      <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-brand-ink-soft">{t('brands_lead')}</p>

      {isLoading ? (
        <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => <li key={i} className="skeleton h-[188px] rounded-[20px]" />)}
        </ul>
      ) : shown.length === 0 ? (
        <p className="mt-8 rounded-[20px] border border-dashed border-brand-card-border p-10 text-center text-brand-ink-soft">{t('brands_empty')}</p>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((b, i) => {
            const n = counts?.get(b.id) ?? 0;
            const desc = brandDescription(b, locale);
            return (
              <motion.li key={b.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: Math.min(i, 10) * 0.03 }}>
                <Link
                  to={`/produtos?marca=${encodeURIComponent(b.slug)}`}
                  aria-label={t('brand_see', { brand: b.name })}
                  className="group flex h-full flex-col rounded-[20px] border border-brand-card-border bg-white p-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_10px_30px_-18px_rgba(23,23,23,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="grid aspect-[3/2] place-items-center overflow-hidden rounded-[14px] bg-brand-alt">
                    {b.logo_url
                      ? <img src={b.logo_url} alt="" loading="lazy" className="max-h-[70%] max-w-[80%] object-contain transition-transform duration-200 group-hover:scale-[1.04]" />
                      : <span className="text-[28px] font-[780] tracking-[-0.03em] text-brand-ink-soft">{b.name.slice(0, 2).toUpperCase()}</span>}
                  </span>
                  <span className="mt-3 block text-[16px] font-semibold text-foreground group-hover:text-brand-orange-text">{b.name}</span>
                  {desc && <span className="mt-0.5 line-clamp-2 text-[13px] text-brand-ink-soft">{desc}</span>}
                  {counts && <span className="mt-auto pt-2 text-[13px] tabular-nums text-muted-foreground">{t(n === 1 ? 'brand_count_one' : 'brand_count_other', { count: n })}</span>}
                </Link>
              </motion.li>
            );
          })}
        </ul>
      )}
    </ListingShell>
  );
}

/** /marca/<slug> -> /produtos?marca=<slug> */
export function BrandRedirect() {
  const { slug = '' } = useParams();
  const s = slug.toLowerCase();
  return <Navigate to={SLUG_RE.test(s) ? `/produtos?marca=${encodeURIComponent(s)}` : '/marcas'} replace />;
}
