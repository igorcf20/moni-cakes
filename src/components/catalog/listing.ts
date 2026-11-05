// Estado das listagens na URL (para partilhar) e regras de categoria, subcategoria, filtros e ordenação.
//
// Parâmetros (valores fixos; os rótulos ficam no i18n):
//   q=texto            busca (feita no servidor)
//   ordem=...          relevancia (padrão) | mais-vendidos | novidades | menor-preco | maior-preco
//   promo=1            apenas ofertas
//   cat=a,b            categorias (só em /produtos)
//   sub=slug           subcategoria (só em /categoria/:slug)
//   preco=min-max      faixa no preço mostrado ao cliente, com moeda=XXX (vale só nessa moeda)
//   f_<caract.>=a,b    especificações (Admin > Especificações; src/lib/productSpecs.ts)
//   marca=a,b          marcas (Admin > Marcas; src/lib/brands.ts)
// Legado: tag=promocoes vale como promo=1 e tag=destaques como ordem=relevancia.
// Só funções puras (sem hooks nem router), para poderem ser testadas fora do navegador; o hook que lê e escreve
// a URL fica em ./useListingParams.
import type { CatalogItem } from '@/hooks/useCatalogProducts';
import type { DbCategory, MenuCategory, MenuSub } from '@/lib/catalogMenu';
import { parseSpecParams, specCount, writeSpecParams, type SpecSelection } from '@/lib/productSpecs';
import { BRAND_PARAM, parseBrandParam } from '@/lib/brands';
import { normText, searchQuery, searchWords } from './text';

export const SORTS = ['relevancia', 'mais-vendidos', 'novidades', 'menor-preco', 'maior-preco'] as const;
export type SortKey = (typeof SORTS)[number];

export type PriceRange = { min: number | null; max: number | null };

export type ListingParams = {
  q: string;
  sort: SortKey;
  promo: boolean;
  cats: string[];
  sub: string | null;
  price: PriceRange | null;
  priceCurrency: string | null;
  specs: SpecSelection;
  /** slugs das marcas escolhidas (OU entre elas) */
  brands: string[];
};

const KNOWN = ['q', 'ordem', 'promo', 'cat', 'sub', 'preco', 'moeda', 'tag', BRAND_PARAM];
const num = (s: string | undefined) => (s === undefined || s === '' ? null : Number.isFinite(Number(s)) ? Math.max(0, Number(s)) : null);

export function parseParams(sp: URLSearchParams): ListingParams {
  const ordem = sp.get('ordem') as SortKey | null;
  const tag = sp.get('tag');
  const m = /^(\d+(?:\.\d+)?)?-(\d+(?:\.\d+)?)?$/.exec(sp.get('preco') ?? '');
  let price: PriceRange | null = m ? { min: num(m[1]), max: num(m[2]) } : null;
  if (price && price.min !== null && price.max !== null && price.min > price.max) price = { min: price.max, max: price.min };
  if (price && price.min === null && price.max === null) price = null;
  return {
    // uma busca sem palavras válidas (ex.: uma letra) não filtra no servidor, por isso não conta como busca
    q: searchQuery((sp.get('q') ?? '').slice(0, 80)),
    sort: ordem && (SORTS as readonly string[]).includes(ordem) ? ordem : 'relevancia',
    promo: sp.get('promo') === '1' || tag === 'promocoes',
    // slugs válidos na forma; os que não estão no menu são ignorados pela listagem (useListing)
    cats: [...new Set((sp.get('cat') ?? '').split(',').map((s) => s.trim()).filter((s) => /^[a-z0-9-]{1,80}$/.test(s)))],
    sub: sp.get('sub')?.trim() || null,
    price,
    priceCurrency: sp.get('moeda'),
    specs: parseSpecParams(sp),
    brands: parseBrandParam(sp.get(BRAND_PARAM)),
  };
}

/** Escreve os parâmetros conhecidos sobre os atuais, mantendo os desconhecidos (utm e afins). */
export function writeParams(current: URLSearchParams, p: ListingParams): URLSearchParams {
  const next = new URLSearchParams(current);
  KNOWN.forEach((k) => next.delete(k));
  if (p.q) next.set('q', p.q);
  if (p.sort !== 'relevancia') next.set('ordem', p.sort);
  if (p.promo) next.set('promo', '1');
  if (p.cats.length) next.set('cat', p.cats.join(','));
  if (p.sub) next.set('sub', p.sub);
  if (p.price && (p.price.min !== null || p.price.max !== null) && p.priceCurrency) {
    next.set('preco', `${p.price.min ?? ''}-${p.price.max ?? ''}`);
    next.set('moeda', p.priceCurrency);
  }
  if (p.brands?.length) next.set(BRAND_PARAM, p.brands.join(','));
  return writeSpecParams(next, p.specs ?? {});
}

/* ------------------------------------------------------------------ */
/* Categorias                                                          */
/* ------------------------------------------------------------------ */

const phrase = (s: string) => normText(s).trim();

/**
 * Termos (sem acentos) procurados no texto de products.category para ligar um produto a uma categoria do catálogo
 * padrão da PRINT3D (pelo slug), enquanto o Admin grava a categoria como texto livre. Categorias com outros slugs
 * ligam-se pela tabela product_categories ou pelo nome. "*" no fim = início de palavra; sem "*" = palavra inteira.
 */
const CATEGORY_TERMS: Record<string, string[]> = {
  decoracao: ['decor*', 'enfeite*', 'adorno*'],
  organizacao: ['organiz*', 'organis*'],
  suportes: ['suporte*', 'soporte*', 'stand', 'stands', 'holder*'],
  geek: ['geek*', 'nerd*', 'colecion*', 'coleccion*', 'collectib*', 'gaming', 'gamer*', 'fantasia*', 'fantasy', 'anime*', 'rpg'],
  casa: ['casa', 'home', 'hogar', 'cozinha*', 'kitchen*', 'cocina*', 'banheiro*', 'bathroom*'],
  personalizados: ['personaliz*', 'custom*', 'presente*', 'gift*', 'regalo*'],
};

/** Mesma regra da secção "Universo geek" da página inicial (useHomeCatalog), para o link "Ver todos" bater certo. */
const GEEK_NAME = /geek|colecion|gaming|fantasia|drag[aã]o|miniatura/i;

/**
 * Termos de cada subcategoria, procurados no nome, categoria e descrição do produto (dentro da categoria).
 * Não há campo de subcategoria em products: é a ligação mais honesta possível com os dados atuais.
 */
const SUB_TERMS: Record<string, string[]> = {
  'decoracao/vasos': ['vaso*', 'vase*', 'cachep*', 'jarro*', 'jarra*', 'jarron*', 'florero*', 'maceta*', 'planter*'],
  'decoracao/esculturas': ['escultura*', 'sculpt*', 'estatua*', 'statue*', 'busto*', 'bust'],
  'decoracao/luminarias': ['luminaria*', 'lampada*', 'lamp*', 'abajur*', 'candeeiro*', 'luz', 'luzes', 'light', 'lights'],
  'decoracao/arte-de-parede': ['parede', 'pared', 'wall', 'quadro*', 'mural*', 'painel*', 'cuadro*'],
  'decoracao/geometrica': ['geometr*', 'facetad*', 'faceted', 'voronoi', 'low poly', 'lowpoly', 'poligon*', 'polygon*'],
  'decoracao/miniaturas': ['miniatura*', 'miniature*', 'mini'],
  'organizacao/mesa': ['mesa', 'desk*', 'escrivaninha*', 'escritorio*'],
  'organizacao/porta-canetas': ['caneta*', 'lapis', 'pen', 'pens', 'pencil*', 'boligrafo*', 'lapices'],
  'organizacao/modulares': ['modular*', 'modulo*', 'gridfinity', 'encaixe*', 'empilhav*', 'stackable'],
  'organizacao/caixas': ['caixa*', 'box', 'boxes', 'caja*', 'estojo*'],
  'organizacao/cabos': ['cabo', 'cabos', 'cable*', 'fio', 'fios', 'carregador*', 'charger*'],
  'organizacao/personalizados': ['personaliz*', 'custom*', 'nome', 'name'],
  'suportes/celular': ['celular*', 'telemovel*', 'smartphone*', 'phone*', 'iphone*', 'telefone*', 'movil*'],
  'suportes/tablet': ['tablet*', 'ipad*'],
  'suportes/headphones': ['fone*', 'headphone*', 'headset*', 'auscultador*', 'auricular*', 'earphone*'],
  'suportes/comandos': ['controle*', 'comando*', 'controller*', 'joystick*', 'gamepad*', 'mando*', 'xbox', 'playstation', 'dualsense'],
  'suportes/notebook': ['notebook*', 'laptop*', 'portatil*', 'macbook*'],
  'suportes/smartwatch': ['smartwatch*', 'relogio*', 'watch*', 'reloj*'],
  'geek/dragoes': ['dragao', 'dragoes', 'dragon*', 'wyvern*'],
  'geek/animais-articulados': ['articulad*', 'articulated', 'flexi*', 'animal*', 'animais'],
  'geek/miniaturas': ['miniatura*', 'miniature*', 'mini', 'figura*', 'figure*', 'figurine*', 'boneco*'],
  'geek/gaming': ['gaming', 'gamer*', 'game', 'games', 'jogo*', 'videogame*', 'console*', 'controle*', 'comando*'],
  'geek/fantasia': ['fantasia*', 'fantasy', 'rpg', 'dungeon*', 'elfo*', 'mago*', 'magia*', 'magic*', 'dnd'],
  'geek/colecionaveis': ['colecion*', 'coleccion*', 'collectib*', 'estatueta*', 'action figure*'],
  'casa/cozinha': ['cozinha*', 'kitchen*', 'cocina*', 'tempero*', 'utensil*', 'talher*', 'caneca*', 'xicara*'],
  'casa/banheiro': ['banheiro*', 'bathroom*', 'casa de banho', 'bano*', 'sabonete*', 'escova*', 'toalha*', 'soap*'],
  'casa/escritorio': ['escritorio*', 'office*', 'oficina*', 'mesa', 'desk*'],
  'casa/plantas': ['planta*', 'plant*', 'suculent*', 'cacto*', 'cactus', 'vaso*', 'cachep*', 'maceta*', 'jardim*', 'garden*'],
  'casa/acessorios': ['acessorio*', 'accessor*', 'gancho*', 'hook*', 'porta chave*', 'cabide*'],
  'personalizados/presentes': ['presente*', 'gift*', 'regalo*', 'personaliz*', 'custom*', 'nome', 'lembranca*', 'chaveiro*', 'porta chaves', 'keychain*', 'placa*'],
};

/** Algum dos termos aparece em `hay` (texto já normalizado com normText)? */
export function hasTerm(hay: string, terms: string[]): boolean {
  return terms.some((raw) => {
    const prefix = raw.endsWith('*');
    const term = phrase(prefix ? raw.slice(0, -1) : raw);
    return term ? hay.includes(prefix ? ` ${term}` : ` ${term} `) : false;
  });
}

/** Subcategoria e categoria de uma listagem: as do menu (src/lib/catalogMenu.ts). */
export type ListingSub = MenuSub;
export type ResolvedCategory = MenuCategory;

/** Ids da categoria na BD e das suas filhas (parent_id ou slug composto "<cat>-<sub>"). */
function dbFamily(slug: string, db: DbCategory[]): Set<string> {
  const root = db.find((c) => c.slug === slug);
  const ids = new Set<string>();
  if (root) ids.add(root.id);
  for (const c of db) if ((root && c.parent_id === root.id) || c.slug.startsWith(`${slug}-`)) ids.add(c.id);
  return ids;
}

export type CategoryMatcher = (item: CatalogItem) => boolean;

/** Regra para um produto pertencer à categoria: ligação na BD, texto de products.category ou termos da categoria. */
export function categoryMatcher(cat: MenuCategory, db: DbCategory[]): CategoryMatcher {
  const { slug } = cat;
  const family = dbFamily(slug, db);
  cat.subs.forEach((s) => { if (s.dbId) family.add(s.dbId); });
  const exact = new Set<string>([phrase(slug)]);
  if (cat.db?.name) exact.add(phrase(cat.db.name));
  cat.labels.forEach((l) => exact.add(phrase(l)));
  // um produto gravado com o nome de uma subcategoria ("Vasos") também é da categoria-mãe
  cat.subs.forEach((s) => { if (s.slug) s.labels.forEach((l) => exact.add(phrase(l))); });
  const terms = CATEGORY_TERMS[slug] ?? [];
  return (item) =>
    item.linkedCategoryIds.some((id) => family.has(id))
    || exact.has(item.categoryN.trim())
    || (terms.length > 0 && hasTerm(item.categoryN, terms))
    || (slug === 'geek' && GEEK_NAME.test(`${item.category} ${item.name}`));
}

/** Regra para a subcategoria (dentro da categoria): ligação na BD, nome da sub em products.category ou termos da sub. */
export function subMatcher(catSlug: string, sub: ListingSub, db: DbCategory[]): CategoryMatcher {
  const root = db.find((c) => c.slug === catSlug);
  const subSlug = sub.slug ?? '';
  const ids = new Set(db.filter((c) => c.slug === `${catSlug}-${subSlug}` || (root && c.parent_id === root.id && c.slug === subSlug)).map((c) => c.id));
  if (sub.dbId) ids.add(sub.dbId);
  const exact = new Set(sub.labels.map(phrase));
  const terms = SUB_TERMS[`${catSlug}/${subSlug}`] ?? [];
  return (item) =>
    item.linkedCategoryIds.some((id) => ids.has(id))
    || exact.has(item.categoryN.trim())
    || hasTerm(item.textN, terms);
}

/* ------------------------------------------------------------------ */
/* Filtros e ordenação                                                 */
/* ------------------------------------------------------------------ */

/**
 * Valor escrito num campo de preço, à maneira do idioma: "1.500" e "10,5" em pt-BR, "1,500" e "10.5" em inglês.
 * Um separador repetido, ou seguido de outro, é de milhar. O último é decimal, a não ser que venha antes de
 * exatamente 3 dígitos e não seja o separador decimal do idioma ("1.500" é 1500 em pt-BR e 1,5 em inglês).
 */
export function parseAmount(text: string, decimal: string): number | null {
  const v = text.replace(/[\s\u00a0\u202f]/g, '');
  if (!/^[\d.,]+$/.test(v) || !/\d/.test(v)) return null;
  const seps = [...v].filter((ch) => ch === '.' || ch === ',');
  let out = '';
  let seen = 0;
  for (let i = 0; i < v.length; i++) {
    const ch = v[i];
    if (ch !== '.' && ch !== ',') { out += ch; continue; }
    seen += 1;
    const digitsAfter = /^\d*/.exec(v.slice(i + 1))?.[0].length ?? 0;
    const group = seps.filter((x) => x === ch).length > 1 || seen < seps.length || (digitsAfter === 3 && ch !== decimal);
    if (!group) out += '.';
  }
  const n = Number(out);
  return Number.isFinite(n) ? n : null;
}

export const inRange = (value: number, range: PriceRange | null) =>
  !range || ((range.min === null || value >= range.min - 0.005) && (range.max === null || value <= range.max + 0.005));

const byDate = (a: CatalogItem, b: CatalogItem) => b.createdAt.localeCompare(a.createdAt);

function relevance(item: CatalogItem, words: string[]): number {
  let score = 0;
  const first = words[0] ? phrase(words[0]) : '';
  if (first && item.nameN.trimStart().startsWith(first)) score += 4;
  for (const w of words.map(phrase)) {
    if (!w) continue;
    if (item.nameN.includes(` ${w}`)) score += 3;
    else if (item.nameN.includes(w)) score += 2;
    if (item.categoryN.includes(w)) score += 1;
    if (item.textN.includes(w)) score += 0.5;
  }
  return score;
}

/** Ordena uma cópia da lista. Destaques: is_featured primeiro, depois a ordem definida no Admin. */
export function sortItems(list: CatalogItem[], sort: SortKey, opts: { q?: string; inCategory?: boolean } = {}): CatalogItem[] {
  const out = [...list];
  const featured = (a: CatalogItem, b: CatalogItem) =>
    Number(b.featured) - Number(a.featured)
    || (a.featured && b.featured ? a.featuredOrder - b.featuredOrder : 0)
    || (opts.inCategory ? a.categoryOrder - b.categoryOrder : a.displayOrder - b.displayOrder)
    || byDate(a, b);
  switch (sort) {
    case 'mais-vendidos':
      return out.sort((a, b) => b.sales - a.sales || Number(b.featured) - Number(a.featured) || byDate(a, b));
    case 'novidades':
      return out.sort((a, b) => Number(b.isNew) - Number(a.isNew) || byDate(a, b));
    case 'menor-preco':
      return out.sort((a, b) => a.displayPrice - b.displayPrice || featured(a, b));
    case 'maior-preco':
      return out.sort((a, b) => b.displayPrice - a.displayPrice || featured(a, b));
    default: {
      const words = opts.q ? searchWords(opts.q) : [];
      if (!words.length) return out.sort(featured);
      const scores = new Map(out.map((i) => [i.id, relevance(i, words)]));
      return out.sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || featured(a, b));
    }
  }
}

export type PriceBounds = { min: number; max: number };

export function priceBounds(list: CatalogItem[]): PriceBounds | null {
  if (!list.length) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const i of list) { if (i.displayPrice < min) min = i.displayPrice; if (i.displayPrice > max) max = i.displayPrice; }
  return { min: Math.floor(min), max: Math.ceil(max) };
}

/** Quantos filtros o cliente ligou (para o botão Filtrar e o "Limpar tudo"). */
export const activeFilterCount = (p: ListingParams, priceActive: boolean) =>
  (p.q ? 1 : 0) + p.cats.length + (priceActive ? 1 : 0) + (p.promo ? 1 : 0) + specCount(p.specs ?? {}) + (p.brands?.length ?? 0);

/* ------------------------------------------------------------------ */
/* SEO                                                                 */
/* ------------------------------------------------------------------ */

export type Crumb = { label: string; href?: string };

/** Dados estruturados (schema.org BreadcrumbList) para o Helmet. */
export function breadcrumbJsonLd(items: Crumb[], origin: string) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      ...(c.href ? { item: `${origin}${c.href}` } : {}),
    })),
  });
}
