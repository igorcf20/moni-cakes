import { useLocale } from '@/i18n';
import { getCountry } from '@/lib/countries';
// Multi-currency support
export type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'BRL' | 'JPY';

interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  locale: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  EUR: { code: 'EUR', symbol: '€', locale: 'pt-PT' },
  USD: { code: 'USD', symbol: '$', locale: 'en-US' },
  GBP: { code: 'GBP', symbol: '£', locale: 'en-GB' },
  BRL: { code: 'BRL', symbol: 'R$', locale: 'pt-BR' },
  JPY: { code: 'JPY', symbol: '¥', locale: 'ja-JP' },
};

// Formatação no idioma escolhido pelo cliente (não no idioma do país da moeda).
const uiLocale = () => useLocale.getState().locale;

export const formatPrice = (price: number, currencyCode: CurrencyCode = getCountry().currency as CurrencyCode): string => {
  const config = CURRENCIES[currencyCode] || { code: currencyCode, locale: uiLocale() };
  return new Intl.NumberFormat(uiLocale(), {
    style: 'currency',
    currency: config.code,
  }).format(price);
};

export const formatDate = (date: string | Date): string => {
  return new Intl.DateTimeFormat(uiLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
};

export const formatDateTime = (date: string | Date): string => {
  return new Intl.DateTimeFormat(uiLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat(uiLocale()).format(num);
};

// Código Postal PT (NNNN-NNN)
export const formatPostalCode = (code: string): string => {
  const cleaned = code.replace(/\D/g, '').slice(0, 7);
  if (cleaned.length <= 4) return cleaned;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
};
// Backwards compatibility alias
export const formatCEP = formatPostalCode;

// Formatação de telefone PT (NNN NNN NNN)
export const formatPhone = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '').slice(0, 9);
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length <= 6) return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
  return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
};

// NIF/NIPC PT (NNN NNN NNN, 9 dígitos)
export const formatNIF = (nif: string): string => {
  const cleaned = nif.replace(/\D/g, '').slice(0, 9);
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length <= 6) return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
  return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
};
// Backwards-compat alias for code that still imports formatCPF
export const formatCPF = formatNIF;

// Valida NIF PT (algoritmo módulo 11)
export const isValidNIF = (nif: string): boolean => {
  const cleaned = nif.replace(/\D/g, '');
  if (cleaned.length !== 9) return false;
  if (!/^[1-9]/.test(cleaned)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += parseInt(cleaned[i]) * (9 - i);
  const mod = sum % 11;
  const check = mod < 2 ? 0 : 11 - mod;
  return check === parseInt(cleaned[8]);
};
