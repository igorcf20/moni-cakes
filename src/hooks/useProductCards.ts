// =====================================================================================
// Cartões de produto (ProductCard3D) a partir de uma lista de ids, pela ordem dada: preço com imposto e moeda
// do país, promoção e avaliação reais. Só produtos ativos. Usado nos Favoritos e no Resumo da conta
// (Compre de novo). A página inicial tem a sua própria consulta (useHomeCatalog).
// =====================================================================================
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CardProduct } from '@/components/product/ProductCard3D';
import { useCurrency } from '@/hooks/use-currency';
import { formatPrice } from '@/utils/currency';
import { withVat } from '@/utils/pricing';
import { getProductPromo } from '@/utils/promo';

export function useProductCards(ids: string[], key = 'product-cards') {
  const { currentCurrency, convert } = useCurrency();
  const joined = ids.join(',');

  const products = useQuery({
    queryKey: [key, joined],
    enabled: ids.length > 0,
    retry: 1,
    // Ao mudar a lista, os cartões continuam visíveis (sem voltar ao esqueleto) enquanto atualiza.
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('products')
        .select('id,name,image,images,price,vat_rate,category,customizable,is_new,is_active,promo_active,promo_type,promo_value,promo_starts_at,promo_ends_at,promo_label')
        .in('id', ids);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  const ratings = useQuery({
    queryKey: [`${key}-ratings`, joined],
    enabled: ids.length > 0,
    retry: 1,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data } = await (supabase as any).from('product_reviews_public').select('product_id,rating').in('product_id', ids);
      const acc = new Map<string, { sum: number; n: number }>();
      for (const r of data ?? []) { const a = acc.get(r.product_id) ?? { sum: 0, n: 0 }; a.sum += Number(r.rating) || 0; a.n += 1; acc.set(r.product_id, a); }
      return acc;
    },
  });

  const cards = useMemo<CardProduct[]>(() => {
    const byId = new Map((products.data ?? []).filter((p) => p.is_active !== false).map((p) => [p.id, p]));
    const fmt = (net: number, vat: number) => formatPrice(convert(withVat(net, vat)), currentCurrency);
    return ids.map((id) => byId.get(id)).filter(Boolean).map((p: any) => {
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
        isNew: !!p.is_new, rating: r ? r.sum / r.n : 0, reviews: r?.n ?? 0, needsOptions: !!p.customizable,
      };
    });
  }, [ids, products.data, ratings.data, convert, currentCurrency]);

  return { cards, isLoading: ids.length > 0 && products.isLoading, isError: products.isError, refetch: products.refetch };
}
