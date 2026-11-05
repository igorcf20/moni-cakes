// i18n mínimo da loja: idioma escolhido (guardado no navegador) e dicionários por funcionalidade.
// Cada dicionário define o pt-BR (idioma padrão) e o TypeScript obriga os outros idiomas a ter as mesmas chaves.
import { useCallback } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const LOCALES = ['pt-BR', 'pt-PT', 'en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'pt-BR';

/** Nome de cada idioma escrito no próprio idioma (para o seletor). */
export const LOCALE_NAMES: Record<Locale, string> = {
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  en: 'English',
  es: 'Español',
};

/** Idioma suportado mais próximo do pedido pelo navegador (pt-BR, pt-PT, en-US, es-AR...). */
export function matchLocale(tag: string | undefined | null): Locale | null {
  if (!tag) return null;
  const lower = tag.toLowerCase();
  const exact = LOCALES.find((l) => l.toLowerCase() === lower);
  if (exact) return exact;
  const lang = lower.split('-')[0];
  if (lang === 'pt') return 'pt-BR';
  return LOCALES.find((l) => l === lang) ?? null;
}

function browserLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  for (const tag of navigator.languages ?? [navigator.language]) {
    const l = matchLocale(tag);
    if (l) return l;
  }
  return DEFAULT_LOCALE;
}

type LocaleState = { locale: Locale; setLocale: (l: Locale) => void };

export const useLocale = create<LocaleState>()(
  persist(
    (set) => ({ locale: browserLocale(), setLocale: (locale) => set({ locale }) }),
    { name: 'loja3d-locale' },
  ),
);

const syncHtmlLang = (l: Locale) => {
  if (typeof document !== 'undefined') document.documentElement.lang = l;
};
syncHtmlLang(useLocale.getState().locale);
useLocale.subscribe((s) => syncHtmlLang(s.locale));

export type Messages = Record<string, string>;
export type Dictionary<T extends Messages> = { 'pt-BR': T } & Record<Exclude<Locale, 'pt-BR'>, { [K in keyof T]: string }>;

/** Declara um dicionário; o pt-BR serve de modelo para as chaves dos outros idiomas. */
export const defineMessages = <T extends Messages>(dict: Dictionary<T>) => dict;

/** Troca {nome} pelos valores dados. */
export function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Tradutor para um dicionário: t('chave', { valor }) no idioma atual, com recurso ao pt-BR. */
export function useMessages<T extends Messages>(dict: Dictionary<T>) {
  const locale = useLocale((s) => s.locale);
  const t = useCallback(
    (key: keyof T, vars?: Record<string, string | number>) =>
      interpolate((dict[locale] as T)[key] ?? dict[DEFAULT_LOCALE][key], vars),
    [dict, locale],
  );
  return { t, locale };
}
