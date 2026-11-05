// =====================================================================================
// Arranque do tema, antes de o React desenhar a primeira página (chamado em src/main.tsx).
// Aplica o último tema visto neste navegador (guardado por BrandManager) ou o tema-base da loja,
// para não piscar as cores de outra marca enquanto a configuração do Admin chega do servidor.
// =====================================================================================
import { STORE_DEFAULTS } from '../config/store.ts';
import { applyTheme } from './applyTheme.ts';
import { mergeTheme } from './brand.ts';
import type { StoreTheme } from './types.ts';

const CACHE_KEY = 'loja-theme-v1';

export function rememberTheme(theme: StoreTheme): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(theme));
  } catch {
    // modo privado ou armazenamento bloqueado: o tema continua a funcionar, só não fica em cache
  }
}

function cachedTheme(): StoreTheme | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? mergeTheme(STORE_DEFAULTS.theme, JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function bootTheme(): void {
  applyTheme(cachedTheme() ?? STORE_DEFAULTS.theme);
}
