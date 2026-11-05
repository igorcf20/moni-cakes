// =====================================================================================
// Privacidade e cookies (LGPD no Brasil, RGPD no EEE): configuração da loja e ferramentas opcionais.
//
// Gravado no Admin > Privacidade e cookies (store_settings.privacy_settings):
//   ga4Id          Google Analytics 4 (G-XXXXXXX): só carrega com consentimento de Estatística
//   metaPixelId    Meta Pixel (números): só carrega com consentimento de Marketing
//   consentMonths  validade da escolha do visitante (6 ou 12 meses); depois o aviso volta
//
// As categorias Estatística e Marketing só aparecem no aviso quando a loja usa alguma ferramenta delas:
// pedir consentimento para o que não existe confunde o visitante e não é transparente.
// O que cada categoria guarda no aparelho está em COOKIE_REGISTRY (mostrado no modal e na política).
// Funções puras; o carregamento das ferramentas fica em src/components/privacy/ConsentScripts.tsx.
// =====================================================================================
import type { ConsentCategory } from './consent';

export type PrivacySettings = {
  ga4Id: string;
  metaPixelId: string;
  consentMonths: 6 | 12;
  /** Programa de afiliados ligado (recurso affiliates; vem de usePrivacySettings, não é gravado aqui). */
  affiliates?: boolean;
  /** PunchOut ligado (recurso punchout; vem de usePrivacySettings, não é gravado aqui). */
  punchout?: boolean;
};

export const DEFAULT_PRIVACY: PrivacySettings = { ga4Id: '', metaPixelId: '', consentMonths: 12 };

export const GA4_RE = /^G-[A-Z0-9]{4,15}$/;
export const META_PIXEL_RE = /^\d{6,20}$/;

export function parsePrivacySettings(value: unknown): PrivacySettings {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const ga4 = typeof v.ga4Id === 'string' ? v.ga4Id.trim().toUpperCase() : '';
  const pixel = typeof v.metaPixelId === 'string' ? v.metaPixelId.trim() : '';
  return {
    ga4Id: GA4_RE.test(ga4) ? ga4 : '',
    metaPixelId: META_PIXEL_RE.test(pixel) ? pixel : '',
    consentMonths: v.consentMonths === 6 ? 6 : 12,
  };
}

export type Tool = { id: 'ga4' | 'meta'; name: string; provider: string; category: Exclude<ConsentCategory, 'essential' | 'preferences'> };

/** Ferramentas ligadas pela loja. */
export function activeTools(s: PrivacySettings): Tool[] {
  const tools: Tool[] = [];
  if (s.ga4Id) tools.push({ id: 'ga4', name: 'Google Analytics 4', provider: 'Google', category: 'analytics' });
  if (s.metaPixelId) tools.push({ id: 'meta', name: 'Meta Pixel', provider: 'Meta', category: 'marketing' });
  return tools;
}

/** Categorias opcionais que o aviso mostra: Preferências sempre; Estatística e Marketing só com ferramenta. */
export function offeredCategories(s: PrivacySettings): Exclude<ConsentCategory, 'essential'>[] {
  const tools = activeTools(s);
  return (['preferences', 'analytics', 'marketing'] as const).filter((c) =>
    c === 'preferences' || tools.some((t) => t.category === c) || (c === 'marketing' && !!s.affiliates));
}

/** Item guardado no aparelho. `purpose` e `duration` são chaves de texto em cookieMessages (src/i18n/legal.ts). */
export type StorageItem = { name: string; provider: string; purpose: string; duration: string; tool?: Tool['id']; feature?: 'affiliates' | 'punchout' | 'lead_popups' };

/** O que o site guarda no aparelho, por categoria. Item novo no código = uma linha aqui. */
export const COOKIE_REGISTRY: Record<ConsentCategory, StorageItem[]> = {
  essential: [
    { name: 'sb-*-auth-token', provider: 'self', purpose: 'p_session', duration: 'd_session_login' },
    { name: 'guest_cart, loja3d-cart-holder', provider: 'self', purpose: 'p_cart', duration: 'd_until_cleared' },
    { name: 'loja3d-locale, loja3d-country', provider: 'self', purpose: 'p_locale', duration: 'd_until_cleared' },
    { name: 'cookie-consent-v2', provider: 'self', purpose: 'p_consent', duration: 'd_consent' },
    { name: 'loja-theme-v1', provider: 'self', purpose: 'p_theme', duration: 'd_until_cleared' },
    { name: 'loja3d-punchout', provider: 'self', purpose: 'p_punchout', duration: 'd_tab', feature: 'punchout' },
    { name: 'loja3d-popups', provider: 'self', purpose: 'p_popups', duration: 'd_tab', feature: 'lead_popups' },
  ],
  preferences: [
    { name: 'print3d-recent-searches', provider: 'self', purpose: 'p_recent', duration: 'd_until_cleared' },
    { name: 'loja3d-compare', provider: 'self', purpose: 'p_compare', duration: 'd_until_cleared' },
    { name: 'loja3d-popups', provider: 'self', purpose: 'p_popups', duration: 'd_until_cleared', feature: 'lead_popups' },
  ],
  analytics: [
    { name: '_ga, _ga_*', provider: 'Google', purpose: 'p_ga', duration: 'd_2y', tool: 'ga4' },
  ],
  marketing: [
    { name: '_fbp', provider: 'Meta', purpose: 'p_fbp', duration: 'd_3m', tool: 'meta' },
    { name: 'loja3d-affiliate', provider: 'self', purpose: 'p_affiliate', duration: 'd_affiliate', feature: 'affiliates' },
  ],
};

/** Itens de uma categoria que existem com esta configuração. */
export function storageFor(category: ConsentCategory, s: PrivacySettings): StorageItem[] {
  const ids = new Set(activeTools(s).map((t) => t.id));
  return COOKIE_REGISTRY[category].filter((i) => (!i.tool || ids.has(i.tool)) && (!i.feature || !!s[i.feature]));
}
