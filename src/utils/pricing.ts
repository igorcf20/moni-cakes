/**
 * Impostos no preço, pela regra do país do cliente (tabela `countries`, ver src/lib/countries.ts).
 *
 * - tax_mode 'inclusive' (Brasil, EUA): o preço do produto já é o preço final; não se soma imposto.
 * - tax_mode 'vat' (Portugal, Espanha): o preço guardado é líquido e soma-se o IVA do país (default_tax_rate).
 *
 * O `vat_rate` de cada produto vem da loja de Portugal e não é usado para outros países: taxas reduzidas por
 * tipo de produto ficam para "classes de imposto" por país. O servidor faz o mesmo cálculo (_shared/pricing.ts).
 */
import { getCountry } from "@/lib/countries";

/** Taxa de imposto a somar ao preço líquido para o país atual (0 em países com preço final). */
export const getVatRate = (_productVatRate?: number | null): number => {
  const c = getCountry();
  return c.taxMode === "vat" ? c.defaultTaxRate : 0;
};

/** Mantido por compatibilidade: taxa padrão do país atual. */
export const DEFAULT_VAT_RATE = getVatRate();

/** Preço final para mostrar (líquido + imposto do país, quando houver). */
export const withVat = (net: number, vatRate?: number | null): number => Number(net || 0) * (1 + getVatRate(vatRate) / 100);

/** Imposto contido num preço líquido. */
export const vatAmount = (net: number, vatRate?: number | null): number => Number(net || 0) * (getVatRate(vatRate) / 100);

/** { net, vat, gross } de um subtotal líquido. */
export const vatBreakdown = (net: number, vatRate?: number | null) => {
  const n = Number(net || 0);
  const vat = vatAmount(n, vatRate);
  return { net: n, vat, gross: n + vat };
};

/** true quando o país destaca o imposto (mostrar "IVA incluído" e afins). */
export const showsTaxSeparately = () => getCountry().taxMode === "vat";
