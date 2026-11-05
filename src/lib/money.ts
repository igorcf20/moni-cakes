// Dinheiro: valores guardados em unidades mínimas (centavos) com o código da moeda ao lado.
// Formatação sempre por Intl, no idioma do cliente. Moedas sem casas decimais (JPY...) são tratadas pelo Intl.
import type { Locale } from '@/i18n';

/** Casas decimais da moeda (BRL/EUR/USD: 2, JPY: 0). */
export const currencyDigits = (currency: string) =>
  new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;

export const toCents = (value: number, currency = 'BRL') => Math.round(value * 10 ** currencyDigits(currency));
export const fromCents = (cents: number, currency = 'BRL') => cents / 10 ** currencyDigits(currency);

/** Valor decimal formatado (ex.: 24.02 → "R$ 24,02"). */
export const formatMoney = (value: number, currency: string, locale: Locale) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);

/** Valor em centavos formatado (ex.: 2402 → "R$ 24,02"). */
export const formatCents = (cents: number, currency: string, locale: Locale) => formatMoney(fromCents(cents, currency), currency, locale);
