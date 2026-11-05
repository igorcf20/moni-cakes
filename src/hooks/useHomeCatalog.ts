import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrency } from '@/hooks/use-currency';
import { formatPrice } from '@/utils/currency';
import { withVat } from '@/utils/pricing';
import { getProductPromo } from '@/utils/promo';
import type { CardProduct } from '@/components/product/ProductCard3D';
import type { MenuCategory } from '@/lib/catalogMenu';

const GEEK = /geek|colecion|gaming|fantasia|drag[aã]o|miniatura/i;
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Produto da categoria em destaque: o campo categoria (ou o nome) cita a categoria ou uma subcategoria dela. */
function spotlightTest(cat: MenuCategory | null | undefined): (text: string) => boolean {
  if (!cat) return () => false;
  const terms = [cat.slug, ...cat.labels, ...cat.subs.flatMap((s) => s.labels)].map(fold).filter((x) => x.length > 2);
  return (text) => (cat.slug === 'geek' && GEEK.test(text)) || terms.some((term) => fold(text).includes(term));
}

/** Produtos da página inicial numa só consulta: destaques, mais vendidos, novidades e a categoria em destaque, com avaliações reais. */
export function useHomeCatalog(spotlight?: MenuCategory | null) {
  const { currentCurrency, convert } = useCurrency();
  const products = useQuery({
    queryKey: ['home-catalog'],
    retry: 1,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('products')
        .select('id,name,image,images,price,vat_rate,category,customizable,is_featured,featured_display_order,sales_count,is_new,created_at,promo_active,promo_type,promo_value,promo_starts_at,promo_ends_at,promo_label')
        .eq('is_active', true).order('created_at', { ascending: false }).limit(80);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  const ids = (products.data ?? []).map((p) => p.id);
  const ratings = useQuery({
    queryKey: ['home-ratings', ids.join(',')],
    enabled: ids.length > 0,
    retry: 1,
    queryFn: async () => {
      const { data } = await (supabase as any).from('product_reviews_public').select('product_id,rating').in('product_id', ids);
      const acc = new Map<string, { sum: number; n: number }>();
      for (const r of data ?? []) { const a = acc.get(r.product_id) ?? { sum: 0, n: 0 }; a.sum += Number(r.rating) || 0; a.n += 1; acc.set(r.product_id, a); }
      return acc;
    },
  });

  return useMemo(() => {
    const raw = products.data ?? [];
    const inSpotlight = spotlightTest(spotlight);
    const fmt = (net: number, vat: number) => formatPrice(convert(withVat(net, vat)), currentCurrency);
    const toCard = (p: any): CardProduct => {
      const promo = getProductPromo(p);
      const base = Number(p.price || 0);
      const r = ratings.data?.get(p.id);
      const images: string[] = Array.isArray(p.images) ? p.images.filter((x: unknown) => typeof x === 'string' && x !== p.image) : [];
      return {
        id: p.id, name: p.name, image: p.image ?? images[0] ?? null, image2: images[0] ?? null,
        price: fmt(promo?.isActive ? promo.effectivePrice : base, p.vat_rate),
        amount: withVat(promo?.isActive ? promo.effectivePrice : base, p.vat_rate),
        oldPrice: promo?.isActive ? fmt(base, p.vat_rate) : null,
        discountPct: promo?.isActive ? Math.round(promo.discountPct) : 0,
        vatRate: p.vat_rate,
        isNew: !!p.is_new, featured: !!p.is_featured, rating: r ? r.sum / r.n : 0, reviews: r?.n ?? 0, needsOptions: !!p.customizable,
      };
    };
    const byFeatured = [...raw].sort((a, b) => Number(!!b.is_featured) - Number(!!a.is_featured) || (a.featured_display_order ?? 999) - (b.featured_display_order ?? 999));
    // "Mais vendidos" só com vendas reais: sem vendas, a vitrine não aparece (nada de lista inventada).
    const bySales = raw.filter((p) => (p.sales_count ?? 0) > 0).sort((a, b) => (b.sales_count ?? 0) - (a.sales_count ?? 0));
    const byNew = [...raw].sort((a, b) => Number(!!b.is_new) - Number(!!a.is_new) || String(b.created_at).localeCompare(String(a.created_at)));
    return {
      isLoading: products.isLoading,
      isEmpty: !products.isLoading && raw.length === 0,
      featured: byFeatured.slice(0, 10).map(toCard),
      best: bySales.slice(0, 15).map(toCard),
      news: byNew.slice(0, 15).map(toCard),
      spotlight: raw.filter((p) => inSpotlight(`${p.category ?? ''} ${p.name}`)).slice(0, 15).map(toCard),
    };
  }, [products.data, products.isLoading, ratings.data, convert, currentCurrency, spotlight]);
}
