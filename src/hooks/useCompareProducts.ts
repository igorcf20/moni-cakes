// =====================================================================================
// Dados da página /comparar (recurso compare): os produtos escolhidos (src/lib/compare.ts), pela ordem da lista.
// Preço e promoção como o cartão de produto (imposto e moeda do país), avaliação real (product_reviews_public),
// cores, tamanhos e disponibilidade com as mesmas regras da página do produto (useProductPage) e as
// especificações (Admin > Especificações + ficha do produto). Só produtos ativos.
// =====================================================================================
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrency } from '@/hooks/use-currency';
import { useFeature } from '@/hooks/useFeatures';
import { usePreorders } from '@/hooks/usePreorders';
import {
  colorOptionsFor, isSoldOut, sizeOptionsAcross, sizeOptionsFor,
  type PdpMatrix, type PdpOptions, type PdpProduct, type PdpSize, type PdpVariation,
} from '@/hooks/useProductPage';
import { formatPrice } from '@/utils/currency';
import { withVat } from '@/utils/pricing';
import { getProductPromo } from '@/utils/promo';

const sb = supabase as any;

/** Disponibilidade mostrada: com estoque, poucas unidades, esgotado, sob encomenda (personalizável) ou pré-venda. */
export type CompareStock = { kind: 'in' | 'low' | 'out' | 'made' | 'preorder'; count?: number };

export type CompareProduct = {
  id: string;
  href: string;
  name: string;
  image: string | null;
  price: string;
  oldPrice: string | null;
  discountPct: number;
  vatRate: number | null;
  rating: number;
  reviews: number;
  stock: CompareStock;
  colors: { name: string; hex: string | null }[];
  sizes: string[];
  category: string;
  brandId: string | null;
  needsOptions: boolean;
  product: PdpProduct;
  specOptionIds: string[];
};

type Raw = {
  products: PdpProduct[];
  ratings: Map<string, { sum: number; n: number }>;
  variations: (PdpVariation & { product_id: string })[];
  sizes: (PdpSize & { product_id: string })[];
  matrix: PdpMatrix[];
  specs: Map<string, string[]>;
};

const LOW_STOCK = 5;

export function useCompareProducts(ids: string[]) {
  const { currentCurrency, convert } = useCurrency();
  const variantsOn = useFeature('variants');
  const specsOn = useFeature('spec_filters');
  const preorders = usePreorders();
  const joined = ids.join(',');

  const query = useQuery({
    queryKey: ['compare-products', joined, specsOn],
    enabled: ids.length > 0,
    retry: 1,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<Raw> => {
      const [products, reviews, variations, sizes, specs] = await Promise.all([
        sb.from('products').select('*').in('id', ids).eq('is_active', true),
        sb.from('product_reviews_public').select('product_id,rating').in('product_id', ids),
        sb.from('product_variations').select('id,product_id,name,color_hex,image_url,price_modifier,display_order,sku,gtin,stock_quantity').in('product_id', ids).eq('is_active', true).order('display_order'),
        sb.from('product_sizes').select('id,product_id,size_label,price_modifier,stock_quantity,display_order,sku,gtin').in('product_id', ids).eq('is_active', true).order('display_order'),
        specsOn ? sb.from('product_spec_options').select('product_id,option_id').in('product_id', ids) : Promise.resolve({ data: [] }),
      ]);
      if (products.error) throw products.error;
      const v = (variations.data ?? []) as Raw['variations'];
      const s = (sizes.data ?? []) as Raw['sizes'];
      let matrix: PdpMatrix[] = [];
      if (v.length && s.length) {
        const m = await sb.from('product_variation_size_availability')
          .select('variation_id,product_size_id,is_available,stock_quantity,price_modifier,sku,gtin,image_url')
          .in('variation_id', v.map((x) => x.id));
        matrix = (m.data ?? []) as PdpMatrix[];
      }
      const ratings = new Map<string, { sum: number; n: number }>();
      for (const r of reviews.data ?? []) {
        const a = ratings.get(String(r.product_id)) ?? { sum: 0, n: 0 };
        a.sum += Number(r.rating) || 0;
        a.n += 1;
        ratings.set(String(r.product_id), a);
      }
      const specMap = new Map<string, string[]>();
      for (const r of (specs.data ?? []) as { product_id: string; option_id: string }[]) {
        specMap.set(String(r.product_id), [...(specMap.get(String(r.product_id)) ?? []), String(r.option_id)]);
      }
      return { products: (products.data ?? []) as PdpProduct[], ratings, variations: v, sizes: s, matrix, specs: specMap };
    },
  });

  const items = useMemo<CompareProduct[]>(() => {
    const raw = query.data;
    if (!raw) return [];
    const byId = new Map(raw.products.map((p) => [String(p.id), p]));
    const fmt = (net: number, vat: number) => formatPrice(convert(withVat(net, vat)), currentCurrency);
    return ids.map((id) => byId.get(id)).filter((p): p is PdpProduct => !!p).map((p) => {
      const id = String(p.id);
      const variations = raw.variations.filter((x) => String(x.product_id) === id);
      const sizes = raw.sizes.filter((x) => String(x.product_id) === id);
      const varIds = new Set(variations.map((x) => x.id));
      const options: PdpOptions = { variations, sizes, matrix: raw.matrix.filter((m) => varIds.has(m.variation_id)), tiers: [], images: [], faqs: [] };
      const preorder = preorders.get(id) ?? null;
      const stockControlled = !p.customizable && !preorder;
      const colors = colorOptionsFor(options, stockControlled, variantsOn, p.stock_quantity ?? null);
      const sizeOpts = sizeOptionsAcross(sizes, options.matrix, colors.map((c) => c.variationId), stockControlled);

      let stock: CompareStock;
      if (preorder) stock = { kind: preorder.remaining === 0 ? 'out' : 'preorder' };
      else if (p.customizable) stock = { kind: 'made' };
      else if (isSoldOut(p, options, colors, stockControlled)) stock = { kind: 'out' };
      else {
        // Unidades que ainda se podem comprar, somando as combinações (null = sem controle de quantidade).
        let total: number | null;
        if (sizes.length) {
          total = colors.length
            ? colors.reduce((n, c) => n + sizeOptionsFor(sizes, options.matrix, c.variationId, true).filter((z) => z.purchasable).reduce((a, z) => a + z.stock, 0), 0)
            : sizeOptionsFor(sizes, options.matrix, undefined, true).filter((z) => z.purchasable).reduce((a, z) => a + z.stock, 0);
        } else if (colors.some((c) => c.stock != null)) total = colors.reduce((n, c) => n + (c.stock ?? 0), 0);
        else total = p.stock_quantity != null ? Math.max(0, p.stock_quantity) : null;
        stock = total != null && total > 0 && total <= LOW_STOCK ? { kind: 'low', count: total } : { kind: 'in' };
      }

      const promo = getProductPromo(p);
      const base = Number(p.price || 0);
      const r = raw.ratings.get(id);
      const images: string[] = Array.isArray(p.images) ? p.images.filter((x: unknown) => typeof x === 'string' && !!x) : [];
      return {
        id,
        href: `/produto/${p.slug || id}`,
        name: String(p.name ?? ''),
        image: p.image ?? images[0] ?? null,
        price: fmt(promo?.isActive ? promo.effectivePrice : base, p.vat_rate),
        oldPrice: promo?.isActive ? fmt(base, p.vat_rate) : null,
        discountPct: promo?.isActive ? Math.round(promo.discountPct) : 0,
        vatRate: p.vat_rate ?? null,
        rating: r ? r.sum / r.n : 0,
        reviews: r?.n ?? 0,
        stock,
        colors: colors.map((c) => ({ name: c.name, hex: c.hex })),
        sizes: sizeOpts.filter((z) => z.available).map((z) => z.label),
        category: String(p.category ?? ''),
        brandId: p.brand_id ? String(p.brand_id) : null,
        needsOptions: !!p.customizable || variations.length > 0 || sizes.length > 0,
        product: p,
        specOptionIds: raw.specs.get(id) ?? [],
      };
    });
  }, [query.data, ids, convert, currentCurrency, preorders, variantsOn]);

  return {
    items,
    isLoading: ids.length > 0 && query.isPending,
    isError: query.isError && !query.data,
    /** a consulta acabou: ids que não vieram já não estão ativos */
    loaded: !!query.data && !query.isPlaceholderData,
    refetch: () => { void query.refetch(); },
  };
}
