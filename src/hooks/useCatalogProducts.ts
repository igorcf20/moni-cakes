// Produtos das listagens (/produtos e /categoria/:slug).
// A busca (?q=) é feita no servidor (ilike em name, description e category); o resto (categoria, subcategoria,
// preço mostrado, ofertas, ordenação) é aplicado no navegador sobre este conjunto, para as contagens e a faixa de
// preço baterem sempre com o que o cliente vê. O catálogo de impressão 3D é pequeno: até MAX_PRODUCTS por consulta.
// Limite: acima de MAX_PRODUCTS produtos ativos (ou de resultados numa busca), a listagem, as contagens e a faixa de
// preço só contam os primeiros MAX_PRODUCTS. `truncated` avisa o cliente na grade e regista um aviso na consola;
// se o catálogo crescer até lá, a categoria, a ordenação e a paginação têm de passar para o servidor.
import { useEffect, useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDbCategories } from '@/hooks/useCatalogMenu';
import type { DbCategory } from '@/lib/catalogMenu';
import { supabase } from '@/integrations/supabase/client';
import { useCurrency } from '@/hooks/use-currency';
import { useLocale } from '@/i18n';
import { useCountry } from '@/lib/countries';
import { formatPrice } from '@/utils/currency';
import { withVat } from '@/utils/pricing';
import { getProductPromo } from '@/utils/promo';
import type { CardProduct } from '@/components/product/ProductCard3D';
import { normText, searchFilter } from '@/components/catalog/text';

export const MAX_PRODUCTS = 500;
const EMPTY: DbCategory[] = [];
const CHUNK = 100;

const SELECT = [
  'id', 'name', 'slug', 'image', 'images', 'price', 'vat_rate', 'category', 'short_description', 'description', 'customizable',
  'is_featured', 'featured_display_order', 'featured_until', 'display_order', 'category_display_order', 'sales_count', 'is_new',
  'created_at', 'promo_active', 'promo_type', 'promo_value', 'promo_starts_at', 'promo_ends_at', 'promo_label', 'unit_type', 'price_per_meter', 'brand_id', 'vendor_id',
].join(',');

export type { DbCategory } from '@/lib/catalogMenu';

export type CatalogItem = {
  id: string;
  name: string;
  /** products.category como o Admin gravou (texto livre, normalmente o nome da categoria) */
  category: string;
  /** texto normalizado (sem acentos, minúsculas, só letras e números) para busca por termos */
  nameN: string;
  categoryN: string;
  textN: string;
  featured: boolean;
  featuredOrder: number;
  displayOrder: number;
  categoryOrder: number;
  sales: number;
  isNew: boolean;
  createdAt: string;
  onSale: boolean;
  /** preço mostrado ao cliente (promoção, imposto do país e moeda atual) */
  displayPrice: number;
  /** ids de categorias da BD ligadas por product_categories */
  linkedCategoryIds: string[];
  /** marca (Admin > Marcas), vazio = sem marca */
  brandId: string | null;
  /** vendedor (Admin > Vendedores, recurso marketplace), vazio = produto da loja */
  vendorId: string | null;
  card: CardProduct;
};

/** Consulta `.in()` em blocos, para não criar URLs enormes; erros num bloco contam como "sem dados". */
async function inChunks(table: string, select: string, ids: string[], extra?: (q: any) => any): Promise<any[]> {
  const parts: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) parts.push(ids.slice(i, i + CHUNK));
  const results = await Promise.all(parts.map(async (part) => {
    try {
      let query = (supabase as any).from(table).select(select).in('product_id', part);
      if (extra) query = extra(query);
      const { data, error } = await query;
      return error ? [] : (data ?? []);
    } catch {
      return [];
    }
  }));
  return results.flat();
}

type Extras = {
  linked: Map<string, string[]>;
  ratings: Map<string, { sum: number; n: number }>;
  withOptions: Set<string>;
};

/** Categorias ligadas, avaliações e opções (variações e tamanhos) dos produtos da lista. */
async function loadExtras(ids: string[]): Promise<Extras> {
  const [links, reviews, variations, sizes] = await Promise.all([
    inChunks('product_categories', 'product_id,category_id', ids),
    inChunks('product_reviews_public', 'product_id,rating', ids),
    inChunks('product_variations', 'product_id', ids, (x) => x.eq('is_active', true)),
    inChunks('product_sizes', 'product_id', ids, (x) => x.eq('is_active', true)),
  ]);
  const linked = new Map<string, string[]>();
  for (const l of links) linked.set(String(l.product_id), [...(linked.get(String(l.product_id)) ?? []), String(l.category_id)]);
  const ratings = new Map<string, { sum: number; n: number }>();
  for (const r of reviews) {
    const a = ratings.get(String(r.product_id)) ?? { sum: 0, n: 0 };
    a.sum += Number(r.rating) || 0;
    a.n += 1;
    ratings.set(String(r.product_id), a);
  }
  const withOptions = new Set<string>([...variations, ...sizes].map((v) => String(v.product_id)));
  return { linked, ratings, withOptions };
}

export function useCatalogProducts(q: string) {
  const term = q.trim();
  const { currentCurrency, convert, rates, markup, baseCurrency } = useCurrency();
  const country = useCountry();
  const locale = useLocale((s) => s.locale);

  // Produtos e dados extra numa só consulta: com keepPreviousData, enquanto uma busca nova carrega, a lista
  // anterior (com as suas ligações e avaliações) continua visível, em vez de voltar ao skeleton e esvaziar os filtros.
  const products = useQuery({
    queryKey: ['catalog-products', term],
    retry: 1,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = (supabase as any).from('products').select(SELECT).eq('is_active', true);
      const filter = searchFilter(term);
      if (filter) query = query.or(filter);
      const { data, error } = await query
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(MAX_PRODUCTS);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const extras = rows.length ? await loadExtras(rows.map((p) => String(p.id))) : null;
      return { rows, extras };
    },
  });

  const categories = useDbCategories();

  // Sem resultados numa busca: confirma se o catálogo inteiro está vazio (para mostrar "em breve" em vez de "nada encontrado").
  const rawCount = products.data?.rows.length ?? -1;
  const total = useQuery({
    queryKey: ['catalog-total'],
    enabled: !!term && rawCount === 0,
    retry: 1,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { count, error } = await (supabase as any).from('products').select('id', { count: 'exact', head: true }).eq('is_active', true);
      return error ? null : (count ?? 0);
    },
  });

  const items = useMemo<CatalogItem[]>(() => {
    const raw = products.data?.rows ?? [];
    const extras = products.data?.extras ?? null;
    const now = Date.now();
    const fmt = (value: number) => formatPrice(value, currentCurrency);
    return raw.map((p) => {
      const id = String(p.id);
      const promo = getProductPromo(p);
      const base = Number(p.price || 0);
      const onSale = !!promo?.isActive;
      const displayPrice = convert(withVat(onSale ? promo!.effectivePrice : base, p.vat_rate));
      const r = extras?.ratings.get(id);
      const images: string[] = Array.isArray(p.images) ? p.images.filter((x: unknown) => typeof x === 'string' && x && x !== p.image) : [];
      const featuredUntil = p.featured_until ? new Date(p.featured_until).getTime() : null;
      const description = String(p.description ?? '').slice(0, 1200);
      return {
        id,
        name: String(p.name ?? ''),
        category: String(p.category ?? ''),
        nameN: normText(p.name),
        categoryN: normText(p.category),
        textN: normText(`${p.name ?? ''} ${p.category ?? ''} ${p.short_description ?? ''} ${description}`),
        featured: !!p.is_featured && (featuredUntil === null || Number.isNaN(featuredUntil) || featuredUntil > now),
        featuredOrder: Number(p.featured_display_order ?? 999),
        displayOrder: Number(p.display_order ?? 999),
        categoryOrder: Number(p.category_display_order ?? p.display_order ?? 999),
        sales: Number(p.sales_count ?? 0),
        isNew: !!p.is_new,
        createdAt: String(p.created_at ?? ''),
        onSale,
        displayPrice,
        linkedCategoryIds: extras?.linked.get(id) ?? [],
        brandId: p.brand_id ? String(p.brand_id) : null,
        vendorId: p.vendor_id ? String(p.vendor_id) : null,
        card: {
          id,
          name: String(p.name ?? ''),
          image: p.image ?? images[0] ?? null,
          image2: p.image ? images[0] ?? null : images[1] ?? null,
          price: fmt(displayPrice),
          amount: withVat(onSale ? promo!.effectivePrice : base, p.vat_rate),
          oldPrice: onSale ? fmt(convert(withVat(base, p.vat_rate))) : null,
          discountPct: onSale ? Math.round(promo!.discountPct) : 0,
          vatRate: p.vat_rate,
          isNew: !!p.is_new,
          featured: !!p.is_featured && (featuredUntil === null || Number.isNaN(featuredUntil) || featuredUntil > now),
          rating: r ? r.sum / r.n : 0,
          reviews: r?.n ?? 0,
          needsOptions: !!p.customizable || !!extras?.withOptions.has(id),
        },
      };
    });
    // country, locale e taxas mudam o imposto (withVat), a formatação (formatPrice) e a conversão, lidos fora do React.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.data, currentCurrency, convert, rates, markup, baseCurrency, country, locale]);

  const truncated = rawCount >= MAX_PRODUCTS;
  useEffect(() => {
    if (truncated) console.warn(`[catalog] A listagem chegou ao limite de ${MAX_PRODUCTS} produtos${term ? ' nesta busca' : ''}: contagens, faixa de preço e ordenação contam só estes.`);
  }, [truncated, term]);

  // Uma falha num refetch em segundo plano mantém os dados válidos: só há erro quando não há nada para mostrar.
  const isError = products.isError && !products.data;
  return {
    items,
    dbCategories: categories.data ?? EMPTY,
    categoriesLoading: categories.isLoading,
    /** primeira carga (sem nada para mostrar ainda) */
    isLoading: products.isPending || categories.isLoading,
    /** a lista mostrada é a da busca anterior enquanto a nova carrega */
    isUpdating: products.isPlaceholderData,
    isError,
    refetch: () => { void products.refetch(); },
    /** nenhum produto ativo na loja (não só nesta busca) */
    catalogEmpty: !products.isPending && !isError && rawCount === 0 && (!term || total.data === 0),
    /** a consulta chegou ao limite; a lista pode não ter todos os produtos */
    truncated,
  };
}
