// Junta os produtos (useCatalogProducts) e o estado da URL (useListingParams) numa listagem pronta a mostrar:
// produtos filtrados e ordenados, contagens por categoria, faixa de preço e número de ofertas.
import { useMemo } from 'react';
import { useCurrency } from '@/hooks/use-currency';
import { useCatalogProducts } from '@/hooks/useCatalogProducts';
import { DEFAULT_LOCALE, useLocale, useMessages } from '@/i18n';
import { catalogMessages, type CatalogMessages } from '@/i18n/catalog';
import { useCatalogMenu } from '@/hooks/useCatalogMenu';
import { findCategory } from '@/lib/catalogMenu';
import { useFeature } from '@/hooks/useFeatures';
import { useSpecAttributes, useSpecRows } from '@/hooks/useProductSpecs';
import { buildSpecIndex, specFacets, specMatcher } from '@/lib/productSpecs';
import { useBrands } from '@/hooks/useBrands';
import { brandDescription, brandFacets, brandMatcher } from '@/lib/brands';
import {
  activeFilterCount, categoryMatcher, inRange, priceBounds, sortItems, subMatcher,
  type Crumb, type ListingParams, type PriceRange,
} from './listing';
import { useListingParams } from './useListingParams';

export type ListingScope = { kind: 'all' } | { kind: 'category'; slug: string };

export function useListing(scope: ListingScope) {
  const { params: raw, update, hrefWith, keepScroll } = useListingParams();
  // cat só vale em /produtos e sub só em /categoria/:slug
  const params = useMemo<ListingParams>(() => (scope.kind === 'all' ? { ...raw, sub: null } : { ...raw, cats: [] }), [raw, scope.kind]);
  const { currentCurrency } = useCurrency();
  const catalog = useCatalogProducts(params.q);
  const db = catalog.dbCategories;
  const menu = useCatalogMenu();
  const locale = useLocale((s) => s.locale);
  // Especificações (Admin > Especificações): só com o recurso ligado e características marcadas para os filtros.
  const specsOn = useFeature('spec_filters');
  const { data: specAttributes = [] } = useSpecAttributes(specsOn);
  const { data: specRows = [] } = useSpecRows(specsOn && specAttributes.some((a) => a.show_in_filters));
  const specIndex = useMemo(() => buildSpecIndex(specRows, specAttributes), [specRows, specAttributes]);
  const specs = useMemo(() => (specsOn ? params.specs : {}), [specsOn, params.specs]);
  // Marcas (Admin > Marcas): filtro só com o recurso ligado; com uma só marca em /produtos, a listagem vira a página dela.
  const brandsOn = useFeature('brands');
  const { data: brands = [] } = useBrands(brandsOn);
  const chosenBrands = useMemo(() => (brandsOn ? params.brands : []), [brandsOn, params.brands]);
  const brandPage = scope.kind === 'all' && chosenBrands.length === 1 && !params.q && !params.cats.length
    ? brands.find((b) => b.slug === chosenBrands[0]) ?? null : null;

  const slug = scope.kind === 'category' ? scope.slug : null;
  const category = useMemo(() => (slug ? findCategory(slug, menu, db, locale) : null), [slug, menu, db, locale]);
  const notFound = scope.kind === 'category' && !category && !catalog.categoriesLoading;
  const sub = category && params.sub ? category.subs.find((s) => s.slug === params.sub) ?? null : null;

  // A faixa de preço só vale na moeda em que foi escolhida. Noutra moeda é ignorada, mas fica na URL: a moeda muda
  // sozinha enquanto as taxas e o país carregam, e apagar a faixa nessa altura estragaria links partilhados.
  const price: PriceRange | null = params.price && params.priceCurrency === currentCurrency ? params.price : null;

  const computed = useMemo(() => {
    const all = catalog.items;
    let scoped = all;
    if (category) scoped = scoped.filter(categoryMatcher(category, db));
    const inCategory = scoped.length;
    if (category && sub) scoped = scoped.filter(subMatcher(category.slug, sub, db));

    const catMatchers = scope.kind === 'all' ? menu.map((c) => ({ slug: c.slug, name: c.name, match: categoryMatcher(c, db) })) : [];
    const chosen = catMatchers.filter((c) => params.cats.includes(c.slug));
    const passCat = (i: (typeof all)[number]) => !chosen.length || chosen.some((c) => c.match(i));
    const passPromo = (i: (typeof all)[number]) => !params.promo || i.onSale;
    const passPrice = (i: (typeof all)[number]) => inRange(i.displayPrice, price);
    const specOk = specMatcher(specIndex, specs);
    const passSpec = (i: (typeof all)[number]) => specOk(i.id);
    const brandOk = brandMatcher(brands, chosenBrands);
    const passBrand = (i: (typeof all)[number]) => brandOk(i.brandId);

    const results = sortItems(scoped.filter((i) => passCat(i) && passPromo(i) && passPrice(i) && passSpec(i) && passBrand(i)), params.sort, { q: params.q, inCategory: !!category });
    const forCats = scoped.filter((i) => passPromo(i) && passPrice(i) && passSpec(i) && passBrand(i));
    const forSpecs = scoped.filter((i) => passCat(i) && passPromo(i) && passPrice(i) && passBrand(i)).map((i) => i.id);
    const forBrands = scoped.filter((i) => passCat(i) && passPromo(i) && passPrice(i) && passSpec(i));
    return {
      results,
      inCategory,
      inScope: scoped.length,
      categoryFacets: catMatchers.map((c) => ({ slug: c.slug, name: c.name, count: forCats.filter(c.match).length })),
      bounds: priceBounds(scoped.filter((i) => passCat(i) && passPromo(i) && passSpec(i) && passBrand(i))),
      offers: scoped.filter((i) => passCat(i) && passPrice(i) && passSpec(i) && passBrand(i) && i.onSale).length,
      specFacets: specsOn ? specFacets(forSpecs, specIndex, specAttributes, specs) : [],
      brandFacets: brandsOn ? brandFacets(forBrands, brands, chosenBrands) : [],
    };
  }, [catalog.items, category, sub, db, menu, scope.kind, params.cats, params.promo, params.sort, params.q, price, specsOn, specIndex, specAttributes, specs, brandsOn, brands, chosenBrands]);

  const activeCount = activeFilterCount({ ...params, specs, brands: chosenBrands }, !!price);
  const clearFilters = () => update({ q: '', cats: [], promo: false, price: null, priceCurrency: null, specs: {}, brands: [] });
  const setPrice = (range: PriceRange | null) =>
    update(range && (range.min !== null || range.max !== null) ? { price: range, priceCurrency: currentCurrency } : { price: null, priceCurrency: null });

  return {
    scope,
    params,
    update: update as (patch: Partial<ListingParams>, opts?: { replace?: boolean }) => void,
    hrefWith,
    keepScroll,
    category,
    sub,
    notFound,
    price,
    currency: currentCurrency,
    activeCount,
    clearFilters,
    specAttributes,
    brands,
    brandPage,
    setPrice,
    isLoading: catalog.isLoading,
    isUpdating: catalog.isUpdating,
    isError: catalog.isError,
    refetch: catalog.refetch,
    catalogEmpty: catalog.catalogEmpty,
    truncated: catalog.truncated,
    ...computed,
  };
}

export type Listing = ReturnType<typeof useListing>;

/* ------------------------------------------------------------------ */
/* Textos: título, apoio, trilho e SEO                                 */
/* ------------------------------------------------------------------ */

const LEAD: Record<string, keyof CatalogMessages> = {
  'bolos-classicos': 'lead_classicos',
  'bolos-recheados': 'lead_recheados',
  'bolos-personalizados': 'lead_personalizados',
  'fatias-e-doces': 'lead_fatias',
};

export function useListingText(l: Listing) {
  const { t, locale } = useMessages(catalogMessages);
  const { params, category, sub } = l;

  const catLabel = category ? category.name || category.slug : '';
  const subLabel = sub ? sub.label : '';
  // Textos da BD estão no idioma padrão da loja; nas categorias do catálogo padrão, noutros idiomas valem os do i18n.
  const dbText = (v?: string | null) => (v?.trim() && (!category?.isDefault || locale === DEFAULT_LOCALE) ? v.trim() : null);

  let title: string;
  let lead: string;
  let crumbs: Crumb[];
  let seoTitle: string;
  let seoDescription: string;
  let canonicalPath: string;

  if (category) {
    title = sub ? subLabel : catLabel;
    lead = dbText(category.db?.description) ?? t(LEAD[category.slug] ?? 'lead_other');
    crumbs = [{ label: t('home'), href: '/' }, { label: t('products'), href: '/produtos' }, { label: catLabel, href: `/categoria/${category.slug}` }];
    if (sub) crumbs.push({ label: subLabel });
    seoTitle = sub ? `${subLabel} | ${catLabel}` : dbText(category.db?.seo_title) ?? catLabel;
    seoDescription = dbText(category.db?.seo_description) ?? lead;
    canonicalPath = `/categoria/${category.slug}${sub?.slug ? `?sub=${encodeURIComponent(sub.slug)}` : ''}`;
  } else if (l.brandPage) {
    const b = l.brandPage;
    title = b.name;
    lead = brandDescription(b, locale) || t('lead_brand', { brand: b.name });
    crumbs = [{ label: t('home'), href: '/' }, { label: t('products'), href: '/produtos' }, { label: t('brands'), href: '/marcas' }, { label: b.name }];
    seoTitle = b.name;
    seoDescription = lead;
    canonicalPath = `/produtos?marca=${encodeURIComponent(b.slug)}`;
  } else {
    const kind = params.q ? 'search' : params.promo ? 'offers' : params.sort === 'mais-vendidos' ? 'best' : params.sort === 'novidades' ? 'new' : 'all';
    title = kind === 'search' ? t('searchTitle', { q: params.q })
      : t(({ offers: 'offersTitle', best: 'bestTitle', new: 'newTitle', all: 'allProducts' } as const)[kind]);
    lead = t(({ search: 'lead_search', offers: 'lead_offers', best: 'lead_best', new: 'lead_new', all: 'lead_all' } as const)[kind]);
    crumbs = [{ label: t('home'), href: '/' }, { label: t('products'), href: '/produtos' }];
    if (kind !== 'all') crumbs.push({ label: kind === 'search' ? t('chipSearch', { q: params.q }) : title });
    seoTitle = title;
    seoDescription = lead;
    canonicalPath = `/produtos${kind === 'offers' ? '?promo=1' : kind === 'best' ? '?ordem=mais-vendidos' : kind === 'new' ? '?ordem=novidades' : ''}`;
  }
  // o último item do trilho é a página atual
  crumbs = crumbs.map((c, i) => (i === crumbs.length - 1 ? { label: c.label } : c));

  return { title, lead, crumbs, catLabel, subLabel, seoTitle, seoDescription, canonicalPath, noindex: !!params.q };
}
