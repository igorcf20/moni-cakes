// =====================================================================================
// Calcular o frete na página do produto (recurso shipping_estimate): o cliente escreve o CEP / código postal e vê as
// formas de envio, o preço e o prazo antes de ir ao carrinho. A conta é a do checkout (função shipping-quote, só com
// formas de envio ligadas em Admin > Frete e entrega); aqui só se mostra.
// Regras em store_settings.shipping_estimate (Admin > Frete e entrega > Calculadora no site).
// Sem imports com @/ para o teste em node (scripts/test-shipping-estimate.mjs).
// =====================================================================================

/** box = caixa aberta com o campo; link = só o link "Calcular frete" que abre a caixa (discreto); off = não mostra. */
export type ShippingEstimateStyle = 'box' | 'link' | 'off';

export type ShippingEstimateSettings = {
  product: ShippingEstimateStyle;
  /** Mostrar o prazo de cada forma de envio. */
  showDays: boolean;
  /** Quantas formas mostrar (as mais baratas primeiro). */
  maxOptions: number;
};

export const DEFAULT_SHIPPING_ESTIMATE: ShippingEstimateSettings = { product: 'box', showDays: true, maxOptions: 3 };

export function normalizeShippingEstimate(raw: unknown): ShippingEstimateSettings {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const style = typeof r.product === 'string' && ['box', 'link', 'off'].includes(r.product) ? (r.product as ShippingEstimateStyle) : DEFAULT_SHIPPING_ESTIMATE.product;
  const n = Number(r.maxOptions);
  return {
    product: style,
    showDays: typeof r.showDays === 'boolean' ? r.showDays : DEFAULT_SHIPPING_ESTIMATE.showDays,
    maxOptions: Number.isFinite(n) ? Math.min(6, Math.max(1, Math.round(n))) : DEFAULT_SHIPPING_ESTIMATE.maxOptions,
  };
}

export type EstimateOption = { service_id: string; price_cents: number; free: boolean; days_min: number | null; days_max: number | null };

/** As formas a mostrar: grátis e mais baratas primeiro, depois a mais rápida; no máximo maxOptions. */
export function pickEstimateOptions<T extends EstimateOption>(options: T[], max: number): T[] {
  const price = (o: T) => (o.free ? 0 : o.price_cents);
  const days = (o: T) => o.days_max ?? o.days_min ?? 999;
  return [...options].sort((a, b) => price(a) - price(b) || days(a) - days(b)).slice(0, Math.max(1, max));
}

/** Prazo em texto: { min, max } iguais = um número só; sem prazo = null. */
export function daysRange(o: Pick<EstimateOption, 'days_min' | 'days_max'>): { min: number; max: number } | null {
  const min = o.days_min ?? o.days_max;
  const max = o.days_max ?? o.days_min;
  if (min == null || max == null) return null;
  return { min: Math.min(min, max), max: Math.max(min, max) };
}
