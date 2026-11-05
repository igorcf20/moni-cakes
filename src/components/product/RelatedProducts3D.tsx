// "Você também pode gostar": os relacionados escolhidos no Admin (aba Venda cruzada do produto, recurso cross_sell)
// primeiro, depois produtos da mesma categoria (completados com novidades), no cartão ProductCard3D.
// Produtos com cores ou tamanhos (ou personalizáveis) vão para a própria página para escolher as opções.
import { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { ProductCard3D, ProductCardSkeleton, type CardProduct } from '@/components/product/ProductCard3D';
import { supabase } from '@/integrations/supabase/client';
import { pgValue } from '@/lib/postgrestFilter';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { useCurrency } from '@/hooks/use-currency';
import { useWishlist } from '@/hooks/useWishlist';
import { useMessages } from '@/i18n';
import { productMessages } from '@/i18n/product';
import { useCountry } from '@/lib/countries';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/utils/currency';
import { withVat } from '@/utils/pricing';
import { getProductPromo } from '@/utils/promo';
import { useFeature } from '@/hooks/useFeatures';
import { fetchRelatedIds, useCrossSellSettings } from '@/hooks/useCrossSell';

const SELECT =
  'id,slug,name,image,images,price,vat_rate,category,customizable,is_new,weight,stock_quantity,created_at,sales_count,promo_active,promo_type,promo_value,promo_starts_at,promo_ends_at,promo_label,promo_show_countdown';
const LIMIT = 10;

type Row = Record<string, any>;
type Related = { row: Row; card: Omit<CardProduct, 'price' | 'oldPrice'>; options: boolean };

function useRelated(productId: string, category: string | null, manualOn: boolean) {
  return useQuery({
    queryKey: ['pdp-related', productId, category, manualOn],
    retry: 1,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Related[]> => {
      const sb = supabase as any;
      const manualIds = manualOn ? await fetchRelatedIds(productId) : [];
      const manual = manualIds.length
        ? await sb.from('products').select(SELECT).eq('is_active', true).in('id', manualIds)
        : { data: [] };
      const manualById = new Map<string, Row>((manual.data ?? []).map((p: Row) => [String(p.id), p]));
      const sameCat = category
        ? await sb.from('products').select(SELECT).eq('is_active', true).eq('category', category).neq('id', productId)
          .order('sales_count', { ascending: false, nullsFirst: false }).limit(LIMIT)
        : { data: [], error: null };
      if (sameCat.error) throw sameCat.error;
      let rows: Row[] = [...manualIds.map((id) => manualById.get(id)).filter(Boolean) as Row[], ...(sameCat.data ?? [])];
      if (rows.length < LIMIT) {
        let q = sb.from('products').select(SELECT).eq('is_active', true).neq('id', productId);
        // neq sozinho deixaria de fora os produtos sem categoria (NULL <> x não é verdadeiro em SQL).
        if (category) q = q.or(`category.is.null,category.neq.${pgValue(category)}`);
        const more = await q.order('created_at', { ascending: false }).limit(LIMIT - rows.length);
        if (!more.error) rows = [...rows, ...(more.data ?? [])];
      }
      const seen = new Set<string>();
      rows = rows.filter((p) => String(p.id) !== productId && !seen.has(p.id) && !!seen.add(p.id)).slice(0, LIMIT);
      const ids = rows.map((p) => p.id);
      if (!ids.length) return [];
      const [vars, sizes, ratings] = await Promise.all([
        sb.from('product_variations').select('product_id').in('product_id', ids).eq('is_active', true),
        sb.from('product_sizes').select('product_id').in('product_id', ids).eq('is_active', true),
        sb.from('product_reviews_public').select('product_id,rating').in('product_id', ids),
      ]);
      const withSizes = new Set<string>((sizes.data ?? []).map((r: Row) => String(r.product_id)));
      const withOptions = new Set<string>([...withSizes, ...(vars.data ?? []).map((r: Row) => String(r.product_id))]);
      const optionsUnknown = !!(vars.error || sizes.error);
      // Esgotados ficam de fora: o stock geral (products.stock_quantity) só conta sem tamanhos, porque com tamanhos
      // o stock está em cada tamanho (o Admin deixa o geral a 0). Sem saber se há tamanhos, não se exclui ninguém.
      rows = rows.filter((p) => p.customizable || sizes.error || withSizes.has(String(p.id)) || p.stock_quantity == null || p.stock_quantity > 0);
      if (!rows.length) return [];
      const acc = new Map<string, { sum: number; n: number }>();
      for (const r of ratings.data ?? []) {
        const a = acc.get(r.product_id) ?? { sum: 0, n: 0 };
        a.sum += Number(r.rating) || 0;
        a.n += 1;
        acc.set(r.product_id, a);
      }
      return rows.map((p) => {
        const r = acc.get(p.id);
        const extra: string[] = Array.isArray(p.images) ? p.images.filter((x: unknown) => typeof x === 'string' && x !== p.image) : [];
        const options = optionsUnknown || !!p.customizable || withOptions.has(String(p.id));
        return {
          row: p,
          options,
          card: {
            id: p.id, name: p.name, image: p.image ?? extra[0] ?? null, image2: p.image ? extra[0] ?? null : extra[1] ?? null,
            isNew: !!p.is_new, rating: r ? r.sum / r.n : 0, reviews: r?.n ?? 0, needsOptions: options,
          },
        };
      });
    },
  });
}

/** Esconde cartões a mais em cada largura para fechar linhas inteiras (2 x 3, 3 x 3, 4 x 2, 5 x 2). */
const visibility = (i: number) => cn(i < 6 ? 'block' : 'hidden', i < 9 ? 'md:block' : 'md:hidden', i < 8 ? 'lg:block' : 'lg:hidden', 'xl:block');

export function RelatedProducts3D({ productId, category, seeAllHref = '/produtos' }: {
  productId: string;
  category: string | null;
  /** categoria do produto quando é conhecida; senão, todos os produtos */
  seeAllHref?: string;
}) {
  const { t } = useMessages(productMessages);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { addToCartAsync } = useCart(user?.id);
  const { isInWishlist, toggleWishlist } = useWishlist(user?.id);
  const { currentCurrency, convert } = useCurrency();
  const country = useCountry();
  const crossSellOn = useFeature('cross_sell');
  const { data: crossSettings } = useCrossSellSettings();
  const related = useRelated(productId, category, crossSellOn && (crossSettings?.relatedOnProduct ?? true));

  const items = useMemo(() => {
    void country; // withVat segue o país atual: recalcula quando o cliente troca de país
    const fmt = (net: number, vat: number) => formatPrice(convert(withVat(net, vat)), currentCurrency);
    return (related.data ?? []).map(({ row, card, options }) => {
      const promo = getProductPromo(row);
      const base = Number(row.price || 0);
      const effective = promo?.isActive ? promo.effectivePrice : base;
      return {
        row, options, effective,
        card: {
          ...card,
          price: fmt(effective, row.vat_rate),
          amount: withVat(effective, row.vat_rate),
          oldPrice: promo?.isActive ? fmt(base, row.vat_rate) : null,
          discountPct: promo?.isActive ? Math.round(promo.discountPct) : 0,
          vatRate: row.vat_rate,
        } as CardProduct,
      };
    });
  }, [related.data, convert, currentCurrency, country]);

  if (related.isError) return null;
  if (!related.isLoading && !items.length) return null;

  const onFavorite = (id: string) => (user ? toggleWishlist(id) : navigate(`/auth?redirect=${encodeURIComponent(location.pathname)}`));
  const onAdd = async (p: CardProduct) => {
    const item = items.find((i) => i.card.id === p.id);
    if (!item) return;
    if (item.options) { navigate(`/produto/${item.row.slug || item.row.id}`); return; }
    const rawBase = Number(item.row.price || 0);
    await addToCartAsync({
      productId: item.row.id,
      quantity: 1,
      designData: {
        name: item.row.name,
        image: item.row.image || '',
        weight: Number(item.row.weight) || 0.5,
        price: item.effective,
        selectionPricing: { version: 1, basePrice: item.effective, modifier: 0, tierRatio: rawBase > 0 ? item.effective / rawBase : 1 },
      },
    });
  };

  return (
    <section className="shell py-12 md:py-16" aria-labelledby="pdp-related-title">
      <div className="mb-6 flex items-end justify-between gap-4 md:mb-8">
        <h2 id="pdp-related-title" className="text-[26px] leading-tight md:text-[30px]">{t('relatedTitle')}</h2>
        <Link to={seeAllHref} className="group -mr-3 inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-xl px-3 text-[15px] font-semibold text-brand-orange-text transition-colors duration-150 hover:bg-accent">
          {t('seeAll')}<ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {related.isLoading
          ? Array.from({ length: LIMIT }, (_, i) => <li key={i} className={visibility(i)}><ProductCardSkeleton /></li>)
          : items.map((it, i) => (
            <li key={it.card.id} className={visibility(i)}>
              <ProductCard3D p={it.card} favorite={isInWishlist(it.card.id)} onFavorite={onFavorite} onAdd={onAdd} />
            </li>
          ))}
      </ul>
    </section>
  );
}
