// Catálogo PRINT3D: 6 categorias principais com subcategorias (mega menu, menu do celular, página inicial).
// Rótulos no i18n (src/i18n/layout.ts, chaves cat_* e sub_*). Com categorias no banco, os slugs devem coincidir.
import { Gamepad2, Home, LayoutGrid, Sparkles, Sprout, Smartphone, type LucideIcon } from 'lucide-react';
import type { MediaKey } from '@/lib/media';

export type CategoryKey = 'cat_decor' | 'cat_organize' | 'cat_stands' | 'cat_geek' | 'cat_home' | 'cat_custom';
export type SubKey =
  | 'sub_vases' | 'sub_sculptures' | 'sub_lamps' | 'sub_wallart' | 'sub_geometric' | 'sub_minidecor'
  | 'sub_desk' | 'sub_pens' | 'sub_modular' | 'sub_boxes' | 'sub_cables' | 'sub_customorg'
  | 'sub_phone' | 'sub_tablet' | 'sub_headphones' | 'sub_controllers' | 'sub_laptop' | 'sub_watch'
  | 'sub_dragons' | 'sub_animals' | 'sub_minis' | 'sub_gaming' | 'sub_fantasy' | 'sub_collectibles'
  | 'sub_kitchen' | 'sub_bathroom' | 'sub_office' | 'sub_plants' | 'sub_homeacc'
  | 'sub_create' | 'sub_upload' | 'sub_customize' | 'sub_gifts';

export type Category = {
  slug: string;
  key: CategoryKey;
  /** rótulo longo no mega menu (ex.: Geek & Colecionáveis) */
  longKey?: 'cat_geek_full';
  Icon: LucideIcon;
  image: MediaKey;
  subs: { key: SubKey; href: string }[];
};

const sub = (cat: string, key: SubKey, slug: string) => ({ key, href: `/categoria/${cat}?sub=${slug}` });

export const CATEGORIES: Category[] = [
  {
    slug: 'decoracao', key: 'cat_decor', Icon: Sprout, image: 'cat-decoracao',
    subs: [sub('decoracao', 'sub_vases', 'vasos'), sub('decoracao', 'sub_sculptures', 'esculturas'), sub('decoracao', 'sub_lamps', 'luminarias'),
      sub('decoracao', 'sub_wallart', 'arte-de-parede'), sub('decoracao', 'sub_geometric', 'geometrica'), sub('decoracao', 'sub_minidecor', 'miniaturas')],
  },
  {
    slug: 'organizacao', key: 'cat_organize', Icon: LayoutGrid, image: 'cat-organizacao',
    subs: [sub('organizacao', 'sub_desk', 'mesa'), sub('organizacao', 'sub_pens', 'porta-canetas'), sub('organizacao', 'sub_modular', 'modulares'),
      sub('organizacao', 'sub_boxes', 'caixas'), sub('organizacao', 'sub_cables', 'cabos'), sub('organizacao', 'sub_customorg', 'personalizados')],
  },
  {
    slug: 'suportes', key: 'cat_stands', Icon: Smartphone, image: 'cat-suportes',
    subs: [sub('suportes', 'sub_phone', 'celular'), sub('suportes', 'sub_tablet', 'tablet'), sub('suportes', 'sub_headphones', 'headphones'),
      sub('suportes', 'sub_controllers', 'comandos'), sub('suportes', 'sub_laptop', 'notebook'), sub('suportes', 'sub_watch', 'smartwatch')],
  },
  {
    slug: 'geek', key: 'cat_geek', longKey: 'cat_geek_full', Icon: Gamepad2, image: 'cat-geek',
    subs: [sub('geek', 'sub_dragons', 'dragoes'), sub('geek', 'sub_animals', 'animais-articulados'), sub('geek', 'sub_minis', 'miniaturas'),
      sub('geek', 'sub_gaming', 'gaming'), sub('geek', 'sub_fantasy', 'fantasia'), sub('geek', 'sub_collectibles', 'colecionaveis')],
  },
  {
    slug: 'casa', key: 'cat_home', Icon: Home, image: 'cat-casa',
    subs: [sub('casa', 'sub_kitchen', 'cozinha'), sub('casa', 'sub_bathroom', 'banheiro'), sub('casa', 'sub_office', 'escritorio'),
      sub('casa', 'sub_plants', 'plantas'), sub('casa', 'sub_homeacc', 'acessorios')],
  },
  {
    slug: 'personalizados', key: 'cat_custom', Icon: Sparkles, image: 'cat-personalizados',
    subs: [{ key: 'sub_create', href: '/personalizar' }, { key: 'sub_upload', href: '/orcamento-3d' },
      { key: 'sub_customize', href: '/personalizar' }, sub('personalizados', 'sub_gifts', 'presentes')],
  },
];

/** Atalhos de listagem (mais vendidos, ofertas, novidades, presentes). */
export const LISTINGS = {
  best: '/produtos?ordem=mais-vendidos',
  offers: '/produtos?promo=1',
  new: '/produtos?ordem=novidades',
  gifts: '/categoria/personalizados?sub=presentes',
};
