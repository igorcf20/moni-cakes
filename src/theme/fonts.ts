// =====================================================================================
// Fontes que o Admin pode escolher (Marca e visual > Fontes).
// Todas vêm embutidas no site (pacotes @fontsource-variable, sem Google Fonts nem pedidos a terceiros)
// e só são descarregadas quando escolhidas: `load()` faz o import dinâmico do CSS da fonte.
// Para acrescentar uma fonte: `npm i @fontsource-variable/<nome>`, uma entrada aqui e o nome no
// dicionário do Admin (src/i18n/adminBrand.ts, chave font_<id>).
// =====================================================================================

export type FontId = 'inter' | 'manrope' | 'dm-sans' | 'outfit' | 'nunito' | 'montserrat' | 'playfair' | 'cormorant' | 'system';

export type FontDef = {
  /** valor de font-family (a primeira é a fonte embutida; o resto é reserva enquanto carrega) */
  family: string;
  /** 'sans' serve para texto corrido; 'serif' fica melhor só em títulos */
  kind: 'sans' | 'serif';
  load: () => Promise<unknown>;
};

const SANS_FALLBACK = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export const FONTS: Record<FontId, FontDef> = {
  // A Inter é importada sempre em src/main.tsx (fonte padrão e reserva de todas as outras).
  inter: { family: `'Inter Variable', 'Inter', ${SANS_FALLBACK}`, kind: 'sans', load: async () => undefined },
  manrope: { family: `'Manrope Variable', ${SANS_FALLBACK}`, kind: 'sans', load: () => import('@fontsource-variable/manrope') },
  'dm-sans': { family: `'DM Sans Variable', ${SANS_FALLBACK}`, kind: 'sans', load: () => import('@fontsource-variable/dm-sans') },
  outfit: { family: `'Outfit Variable', ${SANS_FALLBACK}`, kind: 'sans', load: () => import('@fontsource-variable/outfit') },
  nunito: { family: `'Nunito Variable', ${SANS_FALLBACK}`, kind: 'sans', load: () => import('@fontsource-variable/nunito') },
  montserrat: { family: `'Montserrat Variable', ${SANS_FALLBACK}`, kind: 'sans', load: () => import('@fontsource-variable/montserrat') },
  playfair: { family: `'Playfair Display Variable', Georgia, 'Times New Roman', serif`, kind: 'serif', load: () => import('@fontsource-variable/playfair-display') },
  cormorant: { family: `'Cormorant Garamond Variable', Georgia, 'Times New Roman', serif`, kind: 'serif', load: () => import('@fontsource-variable/cormorant-garamond') },
  system: { family: SANS_FALLBACK, kind: 'sans', load: async () => undefined },
};

export const FONT_IDS = Object.keys(FONTS) as FontId[];

export const isFontId = (v: unknown): v is FontId => typeof v === 'string' && v in FONTS;

/** Descarrega a fonte (uma vez; o navegador guarda em cache). Falhas não partem o site: fica a reserva. */
export function loadFont(id: FontId): void {
  FONTS[id].load().catch(() => undefined);
}
