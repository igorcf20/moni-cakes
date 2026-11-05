// =====================================================================================
// Marca da loja: junta os valores-base (src/config/store.ts) com o que o Admin gravou.
//
// Onde cada coisa fica gravada (tabela store_settings, uma linha por chave):
//   store_brand    logos, frase, cores, fontes, ícone da aba, descrição (Admin > Marca e visual)
//   store_info     nome da loja, contactos (Admin > Configurações > Empresa)
// Chaves antigas ainda lidas como reserva, para lojas que já tinham algo gravado:
//   visual_settings.primary_color / logo_url, seo_settings.meta_description / favicon_url.
// Funções puras (sem React nem rede) para poderem ser testadas em scripts/test-theme.mjs.
// =====================================================================================
import { isHex } from './color.ts';
import { isFontId } from './fonts.ts';
import type { BrandLogos, StoreBrand, StoreTheme, ThemeColors } from './types.ts';

/** Formato gravado na chave "store_brand": tudo opcional; o que faltar vem dos valores-base. */
export type SavedBrand = {
  tagline?: string;
  nameAccent?: string;
  logos?: Partial<BrandLogos>;
  favicon?: string;
  shareImage?: string;
  description?: string;
  theme?: { preset?: string; colors?: Partial<ThemeColors>; fontBody?: string; fontHeading?: string };
};

/** Valores antigos (antes da tela Marca e visual). */
export type LegacyBrand = {
  name?: string;
  primaryColor?: string;
  logoUrl?: string;
  description?: string;
  favicon?: string;
};

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
/** Texto gravado ganha mesmo vazio (vazio = "sem imagem"); ausente = valor-base. */
const keep = (saved: unknown, base: string) => str(saved) ?? base;
const nonEmpty = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

const REQUIRED_COLORS = new Set(['primary', 'primary2', 'background', 'surface', 'surfaceAlt', 'text', 'textMuted', 'border']);

function mergeColors(base: ThemeColors, saved: Partial<ThemeColors> | undefined): ThemeColors {
  if (!saved || typeof saved !== 'object') return { ...base };
  // Com cores gravadas, os ajustes finos vêm só do que foi gravado (ausente = calculado): assim um
  // modelo escolhido no Admin não herda os ajustes finos do tema-base (ex.: o laranja de texto da PRINT3D).
  const out = Object.fromEntries(Object.entries(base).filter(([k]) => REQUIRED_COLORS.has(k))) as ThemeColors;
  for (const [k, v] of Object.entries(saved) as [keyof ThemeColors, unknown][]) {
    if (isHex(str(v))) out[k] = (v as string).toUpperCase();
  }
  return out;
}

export function mergeTheme(base: StoreTheme, saved: SavedBrand['theme']): StoreTheme {
  if (!saved || typeof saved !== 'object') return { ...base, colors: { ...base.colors } };
  return {
    preset: str(saved.preset) ?? base.preset,
    colors: mergeColors(base.colors, saved.colors),
    fontBody: isFontId(saved.fontBody) ? saved.fontBody : base.fontBody,
    fontHeading: isFontId(saved.fontHeading) ? saved.fontHeading : base.fontHeading,
  };
}

/** Marca final = valores-base + antigos (se houver) + o que o Admin gravou na chave "store_brand". */
export function mergeBrand(base: StoreBrand, saved: SavedBrand | null | undefined, legacy: LegacyBrand = {}): StoreBrand {
  const s: SavedBrand = saved && typeof saved === 'object' ? saved : {};
  const legacyTheme = !s.theme && isHex(legacy.primaryColor) ? { colors: { primary: legacy.primaryColor } } : undefined;
  return {
    name: nonEmpty(legacy.name) ?? base.name,
    tagline: keep(s.tagline, base.tagline),
    nameAccent: keep(s.nameAccent, base.nameAccent),
    logos: {
      icon: keep(s.logos?.icon, base.logos.icon),
      wordmark: keep(s.logos?.wordmark, base.logos.wordmark),
      wordmarkLight: keep(s.logos?.wordmarkLight, base.logos.wordmarkLight),
      full: keep(s.logos?.full, nonEmpty(legacy.logoUrl) ?? base.logos.full),
    },
    favicon: keep(s.favicon, nonEmpty(legacy.favicon) ?? base.favicon),
    shareImage: keep(s.shareImage, base.shareImage),
    description: keep(s.description, nonEmpty(legacy.description) ?? base.description),
    theme: mergeTheme(base.theme, s.theme ?? legacyTheme),
  };
}

/** O que gravar na chave "store_brand" a partir da marca editada no Admin (o nome vai para store_info). */
export function toSaved(brand: StoreBrand): SavedBrand {
  const { name: _name, ...rest } = brand;
  return { ...rest, logos: { ...rest.logos }, theme: { ...rest.theme, colors: { ...rest.theme.colors } } };
}

/** Nome em texto com o trecho final destacado (ex.: PRINT + 3D). */
export function splitAccent(name: string, accent: string): [string, string] {
  const a = accent.trim();
  if (a && name.length > a.length && name.toLowerCase().endsWith(a.toLowerCase())) {
    return [name.slice(0, name.length - a.length), name.slice(name.length - a.length)];
  }
  return [name, ''];
}
