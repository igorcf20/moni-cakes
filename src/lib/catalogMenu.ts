// =====================================================================================
// Menu de categorias da loja (cabeçalho, mega menu, menu do celular, busca, página inicial, listagens).
//
// De onde vem:
//   1. Admin > Categorias (tabela categories): categorias principais ativas com "Mostrar no menu",
//      pela ordem do Admin; as subcategorias são as filhas (parent_id). Basta haver uma para valer.
//   2. Sem nenhuma no banco: o catálogo padrão da loja em código (src/lib/catalog.ts, textos no i18n).
//      O Admin > Categorias tem um botão para copiar esse catálogo padrão para o banco e editá-lo.
//
// Nomes por idioma: categories.name (idioma padrão) + categories.name_i18n ({"en": "...", "es": "..."}).
// Funções puras (sem React nem rede); o hook fica em src/hooks/useCatalogMenu.ts.
// =====================================================================================
import {
  Baby, Bike, Book, Brush, Camera, Car, Coffee, Dog, Dumbbell, Flower2, Gamepad2, Gem, Gift, Heart, Home, Lamp, Laptop,
  LayoutGrid, Music, Package, Palette, Shirt, ShoppingBag, Smartphone, Sparkles, Sprout, Star, Tag, Utensils, Watch, Wrench,
  type LucideIcon,
} from 'lucide-react';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/i18n';
import { layoutMessages } from '@/i18n/layout';
import { CATEGORIES } from '@/lib/catalog';
import { mediaUrl, type MediaKey } from '@/lib/media';

/** Ícones que o Admin pode dar a uma categoria (nome gravado em categories.icon). */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  LayoutGrid, Sprout, Home, Smartphone, Gamepad2, Sparkles, Gift, Shirt, Coffee, Utensils, Watch, Gem, Baby, Dog, Car, Bike,
  Book, Music, Palette, Brush, Lamp, Laptop, Camera, Dumbbell, Flower2, Heart, Star, Package, Tag, ShoppingBag, Wrench,
};

/** Linha de categories usada pelo site (só leitura; colunas pedidas em src/hooks/useDbCategories.ts). */
export type DbCategory = {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  seo_title: string | null;
  seo_description: string | null;
  image_url?: string | null;
  icon?: string | null;
  name_i18n?: Record<string, string> | null;
  link_url?: string | null;
  show_in_menu?: boolean | null;
  display_order?: number | null;
};

export type MenuSub = {
  /** chave estável para listas */
  id: string;
  /** valor de ?sub= (null quando a sub é um link para outra página, ex.: /personalizar) */
  slug: string | null;
  label: string;
  /** o nome em todos os idiomas (para ligar produtos pelo texto da categoria) */
  labels: string[];
  href: string;
  dbId: string | null;
};

export type MenuCategory = {
  slug: string;
  name: string;
  /** nome longo para o mega menu (ex.: Geek & Colecionáveis) */
  longName: string;
  labels: string[];
  Icon: LucideIcon;
  /** foto do catálogo padrão (src/lib/media.ts) */
  image: MediaKey | null;
  /** foto enviada no Admin */
  imageUrl: string | null;
  subs: MenuSub[];
  /** linha do banco com o mesmo slug (descrição e SEO), se existir */
  db: DbCategory | null;
  /** veio do catálogo padrão em código */
  isDefault: boolean;
};

const order = (a: DbCategory, b: DbCategory) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.name.localeCompare(b.name);
const nameIn = (row: DbCategory, locale: Locale) => row.name_i18n?.[locale]?.trim() || row.name;
const allNames = (row: DbCategory) => [row.name, ...Object.values(row.name_i18n ?? {})].filter((v): v is string => typeof v === 'string' && !!v.trim());
/** Só links internos (começam por "/"), para o Admin não pôr endereços externos no menu. */
const safeHref = (v: string | null | undefined) => (v && /^\/(?!\/)/.test(v.trim()) ? v.trim() : null);
/** Slug da sub no ?sub=: sem o prefixo "<categoria>-" usado para não repetir slugs no banco. */
export const subSlugOf = (parentSlug: string, childSlug: string) => (childSlug.startsWith(`${parentSlug}-`) ? childSlug.slice(parentSlug.length + 1) : childSlug);

/** Menu a partir do banco: categorias principais visíveis e as suas filhas. Vazio se não houver nenhuma. */
export function dbMenu(rows: DbCategory[], locale: Locale): MenuCategory[] {
  const tops = rows.filter((r) => !r.parent_id && r.show_in_menu !== false).sort(order);
  return tops.map((top) => {
    const kids = rows.filter((r) => r.parent_id === top.id && r.show_in_menu !== false).sort(order);
    return {
      slug: top.slug,
      name: nameIn(top, locale),
      longName: nameIn(top, locale),
      labels: allNames(top),
      Icon: CATEGORY_ICONS[top.icon ?? ''] ?? LayoutGrid,
      image: null,
      imageUrl: top.image_url || null,
      db: top,
      isDefault: false,
      subs: kids.map((k) => {
        const link = safeHref(k.link_url);
        const slug = link ? null : subSlugOf(top.slug, k.slug);
        return {
          id: k.id,
          slug,
          label: nameIn(k, locale),
          labels: allNames(k),
          href: link ?? `/categoria/${top.slug}?sub=${encodeURIComponent(slug as string)}`,
          dbId: k.id,
        };
      }),
    };
  });
}

const subSlugFromHref = (href: string) => {
  const m = /^\/categoria\/[^?]+\?sub=([^&]+)$/.exec(href);
  return m ? decodeURIComponent(m[1]) : null;
};

/** Menu padrão da loja (src/lib/catalog.ts), com os nomes do i18n. */
export function defaultMenu(locale: Locale, rows: DbCategory[] = []): MenuCategory[] {
  const msg = layoutMessages[locale] ?? layoutMessages[DEFAULT_LOCALE];
  const every = (key: keyof typeof msg) => LOCALES.map((l) => layoutMessages[l][key]);
  return CATEGORIES.map((c) => ({
    slug: c.slug,
    name: msg[c.key],
    longName: msg[c.longKey ?? c.key],
    labels: [...every(c.key), ...(c.longKey ? every(c.longKey) : [])],
    Icon: c.Icon,
    image: c.image,
    imageUrl: null,
    db: rows.find((r) => r.slug === c.slug) ?? null,
    isDefault: true,
    subs: c.subs.map((s) => ({ id: s.key, slug: subSlugFromHref(s.href), label: msg[s.key], labels: every(s.key), href: s.href, dbId: null })),
  }));
}

/** O menu que o site mostra: o do banco quando há categorias para o menu, senão o padrão. */
export function buildMenu(rows: DbCategory[], locale: Locale): MenuCategory[] {
  const fromDb = dbMenu(rows, locale);
  return fromDb.length ? fromDb : defaultMenu(locale, rows);
}

/**
 * Categoria pelo slug: a do menu ou, se não estiver no menu (oculta ou subcategoria aberta direto),
 * a linha do banco sozinha.
 */
export function findCategory(slug: string, menu: MenuCategory[], rows: DbCategory[], locale: Locale): MenuCategory | null {
  const inMenu = menu.find((c) => c.slug === slug);
  if (inMenu) return inMenu;
  const row = rows.find((r) => r.slug === slug);
  if (!row) return null;
  const kids = rows.filter((r) => r.parent_id === row.id);
  return dbMenu([{ ...row, parent_id: null, show_in_menu: true }, ...kids], locale)[0] ?? null;
}

/** Catálogo padrão convertido para linhas do banco (botão "Copiar categorias padrão" do Admin). */
export function defaultMenuAsRows(): { top: Omit<DbCategory, 'id' | 'parent_id' | 'description' | 'seo_title' | 'seo_description'>; subs: { slug: string; name: string; name_i18n: Record<string, string>; link_url: string | null }[] }[] {
  const base = layoutMessages[DEFAULT_LOCALE];
  const others = LOCALES.filter((l) => l !== DEFAULT_LOCALE);
  const i18n = (key: keyof typeof base) => Object.fromEntries(others.map((l) => [l, layoutMessages[l][key]]));
  const iconName = (Icon: LucideIcon) => Object.entries(CATEGORY_ICONS).find(([, v]) => v === Icon)?.[0] ?? 'LayoutGrid';
  return CATEGORIES.map((c, i) => ({
    top: {
      slug: c.slug, name: base[c.key], name_i18n: i18n(c.key), icon: iconName(c.Icon), image_url: mediaUrl(c.image),
      link_url: null, show_in_menu: true, display_order: i + 1,
    },
    subs: c.subs.map((s) => {
      const sub = subSlugFromHref(s.href);
      return { slug: sub ? `${c.slug}-${sub}` : `${c.slug}-${s.key.replace(/^sub_/, '')}`, name: base[s.key], name_i18n: i18n(s.key), link_url: sub ? null : s.href };
    }),
  }));
}
