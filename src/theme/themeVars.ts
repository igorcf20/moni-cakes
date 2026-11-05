// =====================================================================================
// Tema -> variáveis CSS (funções puras: correm no navegador, no vite.config.ts e nos testes).
//
// O site inteiro pinta-se com variáveis CSS (src/index.css, lidas pelo Tailwind em tailwind.config.ts:
// bg-primary, text-foreground, text-brand-orange-text...). Aqui transformamos as cores do tema
// (hexadecimal) nessas variáveis. Assim uma loja nova muda de cara sem tocar nos componentes.
//
//   resolveColors(cores)  completa os campos opcionais (calculados para manter contraste legível)
//   themeVars(tema)       { '--primary': '20 100% 52%', ... } para o :root ou para uma pré-visualização
//   applyTheme(tema)      (src/theme/applyTheme.ts) escreve as variáveis no <html> e carrega as fontes
//
// Os nomes "--brand-orange*" vêm da marca PRINT3D e ficaram como nomes técnicos da "cor da marca",
// qualquer que seja a cor (renomear obrigaria a mexer em dezenas de componentes).
// =====================================================================================
import { contrast, darken, ensureContrast, hexToHslString as hsl, isHex, lighten, mix, readableOn, rgba } from './color.ts';
import { FONTS, isFontId } from './fonts.ts';
import type { StoreTheme, ThemeColors } from './types.ts';

export type ResolvedColors = Required<ThemeColors> & {
  onPrimary: string;
  input: string;
  textDeep: string;
};

const pick = (value: string | undefined, fallback: string) => (isHex(value) ? (value as string) : fallback);

/** Completa as cores opcionais e garante contraste mínimo onde o texto pequeno usa a cor da marca. */
export function resolveColors(c: ThemeColors): ResolvedColors {
  const primary = pick(c.primary, '#FF5A0A');
  const background = pick(c.background, '#FFFFFF');
  const text = pick(c.text, '#171717');
  const border = pick(c.border, '#E5E5E5');
  return {
    primary,
    primary2: pick(c.primary2, lighten(primary, 0.15)),
    background,
    surface: pick(c.surface, '#FFFFFF'),
    surfaceAlt: pick(c.surfaceAlt, mix(background, text, 0.04)),
    text,
    textMuted: pick(c.textMuted, mix(text, background, 0.55)),
    border,
    primaryText: pick(c.primaryText, ensureContrast(primary, background, 4.5)),
    primarySoft: pick(c.primarySoft, mix(primary, '#FFFFFF', 0.9)),
    primaryHover: pick(c.primaryHover, darken(primary, 0.07)),
    gradientEnd: pick(c.gradientEnd, primary),
    textSoft: pick(c.textSoft, mix(text, '#FFFFFF', 0.16)),
    // Texto branco nos botões sempre que tiver contraste de texto grande (3:1); senão o mais legível.
    onPrimary: contrast('#FFFFFF', primary) >= 3 ? '#FFFFFF' : readableOn(primary, text),
    input: darken(border, 0.03),
    textDeep: darken(text, 0.3),
  };
}

/** Avisos de legibilidade para o Admin (chaves do dicionário do Admin). */
export function contrastWarnings(c: ThemeColors): ('warn_text' | 'warn_muted' | 'warn_button')[] {
  const r = resolveColors(c);
  const out: ('warn_text' | 'warn_muted' | 'warn_button')[] = [];
  if (contrast(r.text, r.background) < 4.5) out.push('warn_text');
  if (contrast(r.textMuted, r.background) < 3) out.push('warn_muted');
  if (contrast(r.onPrimary, r.primary) < 3) out.push('warn_button');
  return out;
}

/** Todas as variáveis CSS do tema. Serve para o <html> e para pré-visualizações (style de um div). */
export function themeVars(theme: StoreTheme): Record<string, string> {
  const r = resolveColors(theme.colors);
  const body = FONTS[isFontId(theme.fontBody) ? theme.fontBody : 'inter'].family;
  const headingFont = FONTS[isFontId(theme.fontHeading) ? theme.fontHeading : 'inter'];
  const heading = headingFont.family;
  // Serifa nos títulos: peso médio e espaçamento quase normal (a serifa em negrito pesa demais).
  const serif = headingFont.kind === 'serif';
  return {
    // --- base shadcn (src/index.css :root) ---
    '--background': hsl(r.background),
    '--foreground': hsl(r.text),
    '--card': hsl(r.surface),
    '--card-foreground': hsl(r.text),
    '--popover': hsl(r.surface),
    '--popover-foreground': hsl(r.text),
    '--primary': hsl(r.primary),
    '--primary-foreground': hsl(r.onPrimary),
    '--primary-hover': hsl(r.primaryHover),
    '--secondary': hsl(r.surfaceAlt),
    '--secondary-foreground': hsl(r.text),
    '--muted': hsl(r.surfaceAlt),
    '--muted-foreground': hsl(r.textMuted),
    '--accent': hsl(r.primarySoft),
    '--accent-foreground': hsl(r.text),
    '--border': hsl(r.border),
    '--input': hsl(r.input),
    '--ring': hsl(r.primary),
    // --- cor da marca (nomes técnicos herdados da PRINT3D) ---
    '--brand-orange': hsl(r.primary),
    '--brand-orange-2': hsl(r.primary2),
    '--brand-orange-text': hsl(r.primaryText),
    '--brand-orange-soft': hsl(r.primarySoft),
    '--brand-ink': hsl(r.text),
    '--brand-ink-soft': hsl(r.textSoft),
    '--brand-alt': hsl(r.surfaceAlt),
    '--card-border': hsl(r.border),
    // --- aliases antigos que no index.css têm valor fixo ---
    '--brand-navy': hsl(r.text),
    '--brand-navy-deep': hsl(r.textDeep),
    '--brand-royal': hsl(r.primary),
    '--brand-royal-light': hsl(r.primary2),
    '--brand-royal-glow': hsl(lighten(r.primary2, 0.2)),
    '--brand-cyan': hsl(lighten(r.primary2, 0.3)),
    '--brand-graphite': hsl(r.text),
    '--brand-ash': hsl(r.background),
    '--brand-mist': hsl(r.surfaceAlt),
    '--surface-dark': hsl(r.text),
    '--surface-navy': hsl(r.textDeep),
    '--brand-yellow': hsl(r.primary2),
    '--brand-black': hsl(r.text),
    // --- degradês e sombras ---
    '--gradient-primary': `linear-gradient(135deg, ${r.primary2} 0%, ${r.gradientEnd} 100%)`,
    '--gradient-hero': `linear-gradient(180deg, ${r.background} 0%, ${r.surfaceAlt} 100%)`,
    '--gradient-card': `linear-gradient(180deg, ${r.surface} 0%, ${r.background} 100%)`,
    '--gradient-navy': `linear-gradient(180deg, ${lighten(r.text, 0.03)} 0%, ${r.text} 100%)`,
    '--gradient-header': `linear-gradient(90deg, ${r.text}, ${lighten(r.text, 0.03)})`,
    '--gradient-mesh': `radial-gradient(circle at 80% 30%, ${rgba(r.primary2, 0.1)}, transparent 45%), radial-gradient(circle at 10% 90%, ${rgba(r.primary, 0.05)}, transparent 40%)`,
    // Visual editorial: botões da marca sem brilho colorido (a variável fica para componentes antigos).
    '--shadow-glow-orange': 'none',
    '--shadow-ring-royal': `0 0 0 3px ${rgba(r.primary, 0.18)}`,
    // --- fontes ---
    '--font-body': body,
    '--font-heading': heading,
    '--heading-weight': serif ? '560' : '750',
    '--heading-tracking': serif ? '-0.01em' : '-0.025em',
  };
}
