// =====================================================================================
// Aplica o tema no site: variáveis CSS no <html> (calculadas em src/theme/themeVars.ts),
// fontes escolhidas e cor da barra do navegador no celular.
// =====================================================================================
import { FONTS, isFontId, loadFont } from './fonts.ts';
import { resolveColors, themeVars } from './themeVars.ts';
import type { StoreTheme } from './types.ts';

/** Escreve o tema no <html> (por cima dos valores do index.css) e descarrega as fontes escolhidas. */
export function applyTheme(theme: StoreTheme, el: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(themeVars(theme))) el.style.setProperty(name, value);
  if (isFontId(theme.fontBody)) loadFont(theme.fontBody);
  if (isFontId(theme.fontHeading)) loadFont(theme.fontHeading);
  // Títulos com serifa: o index.css acerta peso e tamanho dos títulos grandes da loja (h1 e h2).
  el.dataset.heading = isFontId(theme.fontHeading) ? FONTS[theme.fontHeading].kind : 'sans';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolveColors(theme.colors).background);
}
