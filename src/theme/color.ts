// =====================================================================================
// Cores: conversões e contas usadas pelo tema da loja (src/theme).
// Tudo em hexadecimal (#RRGGBB) na configuração; o CSS do site usa "H S% L%" (ver src/index.css).
// Sem dependências: corre no navegador, no vite.config e nos testes (node --experimental-strip-types).
// Importações relativas de propósito (o vite.config.ts lê este módulo sem os atalhos "@/").
// =====================================================================================

export type Rgb = { r: number; g: number; b: number };

/** Aceita #RGB ou #RRGGBB (com ou sem #). Devolve null se não for uma cor válida. */
export function parseHex(input: string | null | undefined): Rgb | null {
  if (!input) return null;
  const hex = input.trim().replace(/^#/, '');
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) };
}

export const isHex = (input: string | null | undefined) => parseHex(input) !== null;

export function toHex({ r, g, b }: Rgb): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** "#FF5A0A" -> "20 100% 52%" (formato das variáveis CSS do shadcn/Tailwind). */
export function hexToHslString(hex: string): string {
  const rgb = parseHex(hex) ?? { r: 0, g: 0, b: 0 };
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Mistura duas cores: amount 0 = a, 1 = b. */
export function mix(a: string, b: string, amount: number): string {
  const x = parseHex(a) ?? { r: 0, g: 0, b: 0 };
  const y = parseHex(b) ?? { r: 0, g: 0, b: 0 };
  const t = Math.min(1, Math.max(0, amount));
  return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

export const darken = (hex: string, amount: number) => mix(hex, '#000000', amount);
export const lighten = (hex: string, amount: number) => mix(hex, '#FFFFFF', amount);

/** Luminância relativa (WCAG 2.1). */
export function luminance(hex: string): number {
  const rgb = parseHex(hex) ?? { r: 0, g: 0, b: 0 };
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(rgb.r) + 0.7152 * ch(rgb.g) + 0.0722 * ch(rgb.b);
}

/** Contraste WCAG entre duas cores (1 a 21). Texto normal pede 4,5; texto grande e ícones, 3. */
export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Branco ou a cor escura dada, a que tiver mais contraste sobre o fundo. */
export function readableOn(background: string, dark = '#171717'): string {
  return contrast('#FFFFFF', background) >= contrast(dark, background) ? '#FFFFFF' : dark;
}

/**
 * Escurece (ou clareia, em fundo escuro) a cor até atingir o contraste pedido sobre o fundo.
 * Usado para o "laranja de texto pequeno": a cor da marca nem sempre é legível em letras pequenas.
 */
export function ensureContrast(color: string, background: string, target = 4.5): string {
  if (contrast(color, background) >= target) return toHex(parseHex(color) ?? { r: 0, g: 0, b: 0 });
  const towardsBlack = luminance(background) > 0.4;
  for (let i = 1; i <= 20; i++) {
    const next = towardsBlack ? darken(color, i * 0.05) : lighten(color, i * 0.05);
    if (contrast(next, background) >= target) return next;
  }
  return towardsBlack ? '#000000' : '#FFFFFF';
}

/** "#FF5A0A" + 0.55 -> "rgba(255, 90, 10, 0.55)" (sombras coloridas). */
export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex) ?? { r: 0, g: 0, b: 0 };
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
