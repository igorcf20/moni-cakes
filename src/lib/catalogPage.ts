// =====================================================================================
// Página de catálogo: como /produtos e /categoria/:slug se organizam (store_settings.catalog_page).
// Admin > Aparência da loja > Página de catálogo (AdminCatalogPage). Leitura pública, escrita só Admin.
// Tudo opcional e com padrão: sem a linha na base, as listagens usam DEFAULT_CATALOG_PAGE.
// Teste: node --experimental-strip-types scripts/test-catalog-page.mjs
// =====================================================================================

/** Cabeçalho da categoria: título com miniatura (compacto) ou banner grande com foto (como antes). */
export type CatalogHeader = 'compact' | 'banner';
/** Cartão do produto: foto com nome e preço por baixo, ou foto no cartão todo com o texto por cima. */
export type CatalogCard = 'clean' | 'photo';
/** Filtros no computador: coluna fixa à esquerda, ou um botão Filtrar que abre o painel (grade mais larga). */
export type CatalogFilters = 'sidebar' | 'button';

export type CatalogPageSettings = {
  header: CatalogHeader;
  /** texto de apoio da categoria também no celular (no computador aparece sempre) */
  lead_mobile: boolean;
  /** atalhos das categorias na entrada de /produtos */
  shortcuts: boolean;
  card: CatalogCard;
  /** produtos por linha no computador grande */
  columns: 3 | 4;
  /** selo Destaque nos cartões (Promoção e Novo continuam) */
  featured_badge: boolean;
  filters: CatalogFilters;
};

export const DEFAULT_CATALOG_PAGE: CatalogPageSettings = {
  header: 'compact',
  lead_mobile: false,
  shortcuts: true,
  card: 'clean',
  columns: 4,
  featured_badge: false,
  filters: 'sidebar',
};

/** Modelo "Clássico": as listagens como eram antes desta versão (banner grande, cartões de foto inteira, 3 colunas). */
export const CLASSIC_CATALOG_PAGE: CatalogPageSettings = {
  header: 'banner',
  lead_mobile: true,
  shortcuts: true,
  card: 'photo',
  columns: 3,
  featured_badge: true,
  filters: 'sidebar',
};

const pick = <V extends string>(v: unknown, allowed: readonly V[], d: V): V => (allowed.includes(v as V) ? (v as V) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Valor guardado (pode faltar ou ter lixo) -> regras completas. */
export function normalizeCatalogPage(raw: unknown): CatalogPageSettings {
  const r = obj(raw);
  const d = DEFAULT_CATALOG_PAGE;
  return {
    header: pick(r.header, ['compact', 'banner'] as const, d.header),
    lead_mobile: bool(r.lead_mobile, d.lead_mobile),
    shortcuts: bool(r.shortcuts, d.shortcuts),
    card: pick(r.card, ['clean', 'photo'] as const, d.card),
    columns: r.columns === 3 || r.columns === 4 ? r.columns : d.columns,
    featured_badge: bool(r.featured_badge, d.featured_badge),
    filters: pick(r.filters, ['sidebar', 'button'] as const, d.filters),
  };
}

export const sameCatalogPage = (a: CatalogPageSettings, b: CatalogPageSettings) =>
  JSON.stringify(normalizeCatalogPage(a)) === JSON.stringify(normalizeCatalogPage(b));

/**
 * Grade de produtos conforme as regras: classes Tailwind e as colunas reais por largura (do maior para o menor),
 * para "Carregar mais" trazer sempre linhas completas. Celular 2 colunas, tablet 3.
 */
export function catalogGrid(s: Pick<CatalogPageSettings, 'columns' | 'filters'>): { className: string; cols: [string, number][] } {
  const gap = 'grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-5 sm:gap-y-8 md:grid-cols-3';
  if (s.filters === 'button') {
    return s.columns === 4
      ? { className: `${gap} lg:grid-cols-4 2xl:grid-cols-5`, cols: [['(min-width: 1536px)', 5], ['(min-width: 1024px)', 4], ['(min-width: 768px)', 3]] }
      : { className: `${gap} xl:grid-cols-4`, cols: [['(min-width: 1280px)', 4], ['(min-width: 768px)', 3]] };
  }
  return s.columns === 4
    ? { className: `${gap} xl:grid-cols-4 2xl:grid-cols-5`, cols: [['(min-width: 1536px)', 5], ['(min-width: 1280px)', 4], ['(min-width: 768px)', 3]] }
    : { className: `${gap} 2xl:grid-cols-4`, cols: [['(min-width: 1536px)', 4], ['(min-width: 768px)', 3]] };
}
