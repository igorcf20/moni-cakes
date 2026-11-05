// =====================================================================================
// Marcas (recurso brands, Admin > Catálogo > Marcas): tipos e regras puras usadas pelo Admin e pela loja.
//   URL       ?marca=a,b nas listagens (/produtos e /categoria/:slug); /marca/<slug> leva a /produtos?marca=<slug>
//   Filtro    OU entre marcas; contagens com os outros filtros aplicados e sem o da marca
//   Texto     descrição por idioma (description_i18n), senão o idioma padrão, senão vazio
// =====================================================================================

export type Brand = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  website: string | null;
  description_i18n: Record<string, string>;
  is_active: boolean;
  display_order: number;
};

export const BRAND_PARAM = 'marca';
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Château Ávila" -> "chateau-avila" (para o endereço). */
export function brandSlug(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '');
}

/** Descrição no idioma, senão em pt-BR, senão a primeira que houver. */
export function brandDescription(b: Pick<Brand, 'description_i18n'>, locale: string): string {
  const m = b.description_i18n ?? {};
  const pick = (k: string) => (typeof m[k] === 'string' && m[k].trim() ? m[k].trim() : '');
  return pick(locale) || pick('pt-BR') || Object.values(m).find((v) => typeof v === 'string' && v.trim())?.trim() || '';
}

/** Slugs da URL (?marca=a,b), só na forma válida. */
export function parseBrandParam(value: string | null): string[] {
  return [...new Set((value ?? '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.length <= 80 && SLUG_RE.test(s)))];
}

export function toggleBrand(list: string[], slug: string, on: boolean): string[] {
  return on ? [...new Set([...list, slug])] : list.filter((s) => s !== slug);
}

export type BrandFacet = { brand: Brand; count: number };

/** Marcas com produtos na lista (ou já escolhidas), por ordem do Admin e depois pelo nome. */
export function brandFacets(items: { brandId: string | null }[], brands: Brand[], chosen: string[]): BrandFacet[] {
  const counts = new Map<string, number>();
  for (const i of items) if (i.brandId) counts.set(i.brandId, (counts.get(i.brandId) ?? 0) + 1);
  return brands
    .map((brand) => ({ brand, count: counts.get(brand.id) ?? 0 }))
    .filter((f) => f.count > 0 || chosen.includes(f.brand.slug))
    .sort((a, b) => a.brand.display_order - b.brand.display_order || a.brand.name.localeCompare(b.brand.name));
}

/** O produto passa no filtro de marcas? Sem marcas escolhidas, passa sempre. Slugs desconhecidos são ignorados. */
export function brandMatcher(brands: Brand[], chosen: string[]) {
  const ids = new Set(brands.filter((b) => chosen.includes(b.slug)).map((b) => b.id));
  if (!ids.size) return () => true;
  return (brandId: string | null) => !!brandId && ids.has(brandId);
}
