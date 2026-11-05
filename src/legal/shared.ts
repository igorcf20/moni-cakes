// Ajudas comuns do conteúdo legal: jurisdição pelo país, países do EEE (RGPD) e nomes dos fornecedores
// configurados no país (meios de pagamento, transportadora, faturação).
import type { Country } from '@/lib/countries';
import type { JurisdictionCode } from './types';

/** Espaço Económico Europeu (UE + Islândia, Liechtenstein e Noruega): aplica-se o RGPD. */
const EEA = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT',
  'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO',
]);

export const isEU = (code: string) => EEA.has((code || '').toUpperCase());

/** Texto legal a usar para o país: Brasil, Portugal, Espanha ou a versão internacional (inglês). */
export function jurisdictionOf(code: string): JurisdictionCode {
  const c = (code || '').toUpperCase();
  return c === 'BR' || c === 'PT' || c === 'ES' ? c : 'INTL';
}

const PAYMENT_NAMES: Record<string, string> = {
  mercado_pago: 'Mercado Pago',
  viva: 'Viva.com',
  stripe: 'Stripe',
  paypal: 'PayPal',
  pagseguro: 'PagBank',
};

const SHIPPING_NAMES: Record<string, string> = {
  ctt: 'CTT',
  correios: 'Correios',
};

const INVOICE_NAMES: Record<string, string> = {
  fiz: 'FIZ',
};

/** Nomes conhecidos dos meios de pagamento configurados no país (os desconhecidos ficam genéricos). */
export const paymentNames = (country: Country) =>
  country.paymentProviders.map((p) => PAYMENT_NAMES[p]).filter((n): n is string => !!n);

export const hasPayment = (country: Country, id: string) => country.paymentProviders.includes(id);

/** Transportadora configurada no país, quando tem nome conhecido. */
export const shippingName = (country: Country) => (country.shippingProvider ? SHIPPING_NAMES[country.shippingProvider] ?? null : null);

/** Emissor de faturas configurado no país, quando tem nome conhecido. */
export const invoiceName = (country: Country) => (country.invoiceProvider ? INVOICE_NAMES[country.invoiceProvider] ?? null : null);

/** Ligação de e-mail em texto rico. */
export const mailLink = (email: string) => `[${email}](mailto:${email})`;

/** Ligação de telefone em texto rico. */
export const telLink = (phone: string) => `[${phone}](tel:${phone.replace(/[^\d+]/g, '')})`;

/** No Brasil o documento da loja pode ser CPF (11 dígitos) ou CNPJ (14 caracteres, também alfanumérico). */
export const brTaxIdLabel = (taxId: string) => (/^\d{11}$/.test(taxId.replace(/[^0-9A-Za-z]/g, '')) ? 'CPF' : 'CNPJ');
