// Cardápio padrão da Moni Cakes: 4 categorias com subcategorias (mega menu, menu do celular, listagens).
// Vale enquanto não houver categorias no Admin > Categorias (o Admin pode copiar este cardápio para o banco).
// Rótulos no i18n (src/i18n/layout.ts, chaves cat_* e sub_*). Com categorias no banco, os slugs devem coincidir.
import { Cake, CakeSlice, Cookie, Sparkles, type LucideIcon } from 'lucide-react';
import type { MediaKey } from '@/lib/media';

export type CategoryKey = 'cat_classic' | 'cat_filled' | 'cat_custom' | 'cat_sweets';
export type SubKey =
  | 'sub_chocolate' | 'sub_fruit' | 'sub_homemade'
  | 'sub_creams' | 'sub_berries' | 'sub_nuts'
  | 'sub_birthday' | 'sub_wedding' | 'sub_kids' | 'sub_events'
  | 'sub_slices' | 'sub_sweets' | 'sub_pies';

export type Category = {
  slug: string;
  key: CategoryKey;
  /** rótulo longo no mega menu */
  longKey?: CategoryKey;
  Icon: LucideIcon;
  image: MediaKey;
  subs: { key: SubKey; href: string }[];
};

const sub = (cat: string, key: SubKey, slug: string) => ({ key, href: `/categoria/${cat}?sub=${slug}` });

export const CATEGORIES: Category[] = [
  {
    slug: 'bolos-classicos', key: 'cat_classic', Icon: Cake, image: 'moni/thumb-classico',
    subs: [sub('bolos-classicos', 'sub_chocolate', 'chocolate'), sub('bolos-classicos', 'sub_fruit', 'frutas'),
      sub('bolos-classicos', 'sub_homemade', 'caseiros')],
  },
  {
    slug: 'bolos-recheados', key: 'cat_filled', Icon: CakeSlice, image: 'moni/thumb-recheado',
    subs: [sub('bolos-recheados', 'sub_creams', 'cremes'), sub('bolos-recheados', 'sub_berries', 'frutas-vermelhas'),
      sub('bolos-recheados', 'sub_nuts', 'nozes-e-castanhas')],
  },
  {
    slug: 'bolos-personalizados', key: 'cat_custom', Icon: Sparkles, image: 'moni/thumb-personalizado',
    subs: [sub('bolos-personalizados', 'sub_birthday', 'aniversario'), sub('bolos-personalizados', 'sub_wedding', 'casamento'),
      sub('bolos-personalizados', 'sub_kids', 'infantil'), sub('bolos-personalizados', 'sub_events', 'eventos')],
  },
  {
    slug: 'fatias-e-doces', key: 'cat_sweets', Icon: Cookie, image: 'moni/fatia-morango',
    subs: [sub('fatias-e-doces', 'sub_slices', 'fatias'), sub('fatias-e-doces', 'sub_sweets', 'docinhos'),
      sub('fatias-e-doces', 'sub_pies', 'tortas')],
  },
];

/** Atalhos de listagem (mais vendidos, ofertas, novidades, presentes). */
export const LISTINGS = {
  best: '/produtos?ordem=mais-vendidos',
  offers: '/produtos?promo=1',
  new: '/produtos?ordem=novidades',
  gifts: '/categoria/bolos-personalizados',
};
