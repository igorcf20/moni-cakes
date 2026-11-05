// =====================================================================================
// Página inicial editável no Admin > Conteúdo da página inicial (store_settings.home_page).
//
// O que o Admin muda (tudo opcional; vazio = padrão da loja):
//   hidden     seções escondidas (ids de HOME_SECTIONS)
//   texts      textos por idioma: {"pt-BR": {"hero_lead": "..."}, "en": {...}}; as chaves são as de
//              src/i18n/layout.ts listadas em HOME_SECTIONS (o padrão de cada idioma continua no i18n)
//   images     fotos das seções com imagem (destaque, banner Crie sua peça, banner do material)
//   spotlight  slug da categoria da seção "Categoria em destaque" (padrão: geek)
//
// Seção nova na página inicial = uma entrada em HOME_SECTIONS (+ nome em src/i18n/adminHome.ts) e o
// componente em src/pages/Index.tsx a ler `isVisible(id)` e os textos pelo `t` da página.
// Funções puras; o hook fica em src/hooks/useHomePage.ts.
// =====================================================================================
import type { Locale } from '@/i18n';
import type { layoutMessages } from '@/i18n/layout';

export type HomeTextKey = keyof (typeof layoutMessages)['pt-BR'];
export type HomeImageId = 'hero' | 'create' | 'pla' | 'story' | 'story2';

export type HomeSection = {
  id: string;
  /** textos editáveis, pela ordem em que aparecem */
  keys: HomeTextKey[];
  /** textos mais longos (caixa de várias linhas no Admin) */
  long?: HomeTextKey[];
  image?: HomeImageId;
  /** segunda foto (seção com duas fotos) */
  image2?: HomeImageId;
  /** a seção não pode ser escondida */
  fixed?: boolean;
};

/** Seções da página inicial, pela ordem do site. */
export const HOME_SECTIONS: HomeSection[] = [
  { id: 'hero', fixed: true, image: 'hero', keys: ['hero_eyebrow', 'hero_title_a', 'hero_title_3d', 'hero_title_b', 'hero_lead', 'hero_cta', 'hero_cta2', 'hero_b1', 'hero_b2', 'hero_b3', 'hero_side'], long: ['hero_lead'] },
  { id: 'trust', keys: ['trust_ship', 'trust_secure', 'trust_pay', 'trust_pla'] },
  // Banners de campanha: conteúdo no Admin > Banners (some sozinha sem banners ativos).
  { id: 'campaigns', keys: [] },
  { id: 'categories', keys: ['cats_title'] },
  // História da marca: texto, botão para a página Sobre, duas fotos e um cartão de frase.
  { id: 'story', image: 'story', image2: 'story2', keys: ['story_eyebrow', 'story_title', 'story_text', 'story_cta', 'story_card_eyebrow', 'story_card_title'], long: ['story_text'] },
  { id: 'featured', keys: ['featured_title'] },
  { id: 'best', keys: ['best_title'] },
  { id: 'news', keys: ['new_title'] },
  // Kits com desconto marcados para a página inicial (Admin > Kits; recurso kits). Sem kits, a seção não aparece.
  { id: 'kits', keys: ['kits_title', 'kits_sub'] },
  { id: 'spotlight', keys: ['geek_title'] },
  { id: 'create', image: 'create', keys: ['create_eyebrow', 'create_title', 'create_text', 'create_cta', 'create_cta2'], long: ['create_text'] },
  { id: 'material', image: 'pla', keys: ['pla_eyebrow', 'pla_title', 'pla_text', 'pla_cta'], long: ['pla_text'] },
  {
    id: 'how',
    keys: ['how_eyebrow', 'how_title', 'how_1', 'how_1_sub', 'how_2', 'how_2_sub', 'how_3', 'how_3_sub', 'how_4', 'how_4_sub', 'how_cta', 'how_cta2'],
  },
  { id: 'reviews', keys: ['reviews_title', 'reviews_sub'] },
  { id: 'inspirations', keys: ['insp_title', 'insp_sub', 'insp_cta'] },
  // No rodapé de todas as páginas (src/components/Footer.tsx).
  { id: 'newsletter', keys: ['newsletter_title', 'newsletter_sub'] },
];

export const HOME_TEXT_KEYS: HomeTextKey[] = HOME_SECTIONS.flatMap((s) => s.keys);
const SECTION_IDS = new Set(HOME_SECTIONS.map((s) => s.id));
const TEXT_KEYS = new Set<string>(HOME_TEXT_KEYS);
const IMAGE_IDS: HomeImageId[] = ['hero', 'create', 'pla', 'story', 'story2'];
export const DEFAULT_SPOTLIGHT = 'geek';

export type HomePage = {
  hidden: string[];
  texts: Partial<Record<Locale, Partial<Record<HomeTextKey, string>>>>;
  images: Partial<Record<HomeImageId, string>>;
  spotlight: string;
};

export const EMPTY_HOME: HomePage = { hidden: [], texts: {}, images: {}, spotlight: DEFAULT_SPOTLIGHT };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Lê o valor gravado, ignorando o que não for conhecido (chaves antigas, tipos errados). */
export function parseHomePage(value: unknown): HomePage {
  if (!isObj(value)) return { ...EMPTY_HOME };
  const hidden = Array.isArray(value.hidden) ? value.hidden.filter((id): id is string => typeof id === 'string' && SECTION_IDS.has(id)) : [];
  const texts: HomePage['texts'] = {};
  if (isObj(value.texts)) {
    for (const [locale, entries] of Object.entries(value.texts)) {
      if (!isObj(entries)) continue;
      const clean = Object.fromEntries(Object.entries(entries).filter(([k, v]) => TEXT_KEYS.has(k) && str(v)).map(([k, v]) => [k, str(v)]));
      if (Object.keys(clean).length) texts[locale as Locale] = clean;
    }
  }
  const images: HomePage['images'] = {};
  if (isObj(value.images)) for (const id of IMAGE_IDS) if (str(value.images[id])) images[id] = str(value.images[id]);
  const spotlight = /^[a-z0-9-]{1,80}$/.test(str(value.spotlight)) ? str(value.spotlight) : DEFAULT_SPOTLIGHT;
  return { hidden: [...new Set(hidden)], texts, images, spotlight };
}

/** Valor a gravar: só o que difere do padrão (textos vazios saem). */
export function toSavedHome(page: HomePage): HomePage {
  return parseHomePage(page);
}

/** Texto do Admin para este idioma, ou null para usar o padrão do i18n. */
export function homeText(page: HomePage, locale: Locale, key: string): string | null {
  return page.texts[locale]?.[key as HomeTextKey] || null;
}
