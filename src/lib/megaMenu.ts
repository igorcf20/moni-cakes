// =====================================================================================
// Menu "Todas as categorias" (mega menu do computador e menu do celular): categorias em destaque com banner.
// Regras em store_settings.mega_menu (Admin > Categorias > Menu de categorias). Funções puras; teste em
// scripts/test-mega-menu.mjs.
//   featuredMode  auto = as primeiras categorias do menu; manual = as escolhidas (featured, pela ordem); off = sem banners
//   count         quantos banners no modo auto (1 a 4)
//   showText      texto curto no banner (descrição da categoria ou as subcategorias)
//   sideCard      cartão Novidades ao lado das colunas (news) ou nada (off)
//   quickLinks    atalhos Mais vendidos, Ofertas, Novidades, Presentes
//   mobile        banners também no menu do celular (faixa que rola para o lado)
// A foto do banner é a foto da categoria (Admin > Categorias) ou a do catálogo padrão; sem foto, a reserva de camadas.
// =====================================================================================

export type MegaMenuSettings = {
  featuredMode: 'auto' | 'manual' | 'off';
  featured: string[];
  count: number;
  showText: boolean;
  sideCard: 'news' | 'off';
  quickLinks: boolean;
  mobile: boolean;
};

export const MEGA_MENU_MAX_FEATURED = 4;

export const DEFAULT_MEGA_MENU: MegaMenuSettings = {
  featuredMode: 'auto', featured: [], count: 3, showText: true, sideCard: 'news', quickLinks: true, mobile: true,
};

export function normalizeMegaMenu(raw: unknown): MegaMenuSettings {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const b = (k: keyof MegaMenuSettings) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : (DEFAULT_MEGA_MENU[k] as boolean));
  const n = Math.round(Number(r.count));
  const featured = Array.isArray(r.featured)
    ? [...new Set(r.featured.filter((s): s is string => typeof s === 'string' && !!s.trim()).map((s) => s.trim()))].slice(0, MEGA_MENU_MAX_FEATURED)
    : [];
  return {
    featuredMode: r.featuredMode === 'manual' || r.featuredMode === 'off' ? r.featuredMode : 'auto',
    featured,
    count: Number.isFinite(n) ? Math.min(MEGA_MENU_MAX_FEATURED, Math.max(1, n)) : DEFAULT_MEGA_MENU.count,
    showText: b('showText'),
    sideCard: r.sideCard === 'off' ? 'off' : 'news',
    quickLinks: b('quickLinks'),
    mobile: b('mobile'),
  };
}

/** Categorias em destaque, pela regra: auto = primeiras do menu; manual = as escolhidas que ainda existem no menu. */
export function pickFeatured<T extends { slug: string }>(menu: T[], s: MegaMenuSettings): T[] {
  if (s.featuredMode === 'off') return [];
  if (s.featuredMode === 'auto') return menu.slice(0, s.count);
  return s.featured.map((slug) => menu.find((c) => c.slug === slug)).filter((c): c is T => !!c).slice(0, MEGA_MENU_MAX_FEATURED);
}

/** Texto curto do banner: a descrição da categoria ou os nomes das primeiras subcategorias. */
export function bannerText(c: { db?: { description?: string | null } | null; subs: { label: string }[] }, max = 3): string {
  const d = c.db?.description?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (d) return d.length > 90 ? `${d.slice(0, 87).trimEnd()}...` : d;
  return c.subs.slice(0, max).map((s) => s.label).join(', ');
}
