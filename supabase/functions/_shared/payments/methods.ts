// Regras dos meios de pagamento (Admin > Pagamentos), sem acesso à rede nem à base de dados.
// Usadas pelo create-order (validar o meio e calcular o desconto) e pelo teste scripts/test-payments.mjs.
// A mesma regra de "onde o meio aparece" está em src/lib/paymentMethods.ts (checkout); o teste compara as duas.

export type PaymentMethodRow = {
  type: string;
  is_active?: boolean | null;
  countries?: string[] | null;
  discount_percent?: number | string | null;
  min_total?: number | string | null;
  max_total?: number | string | null;
};

/** Meios pagos num provedor externo (payment-start abre o pagamento, payment-verify confirma na API). */
export const GATEWAY_METHODS = ["mercado_pago", "stripe", "paypal"] as const;
export type GatewayMethod = (typeof GATEWAY_METHODS)[number];
export const isGatewayMethod = (type: string): type is GatewayMethod => (GATEWAY_METHODS as readonly string[]).includes(type);

const num = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Por que o meio não serve este pedido: "inactive", "country" ou "min" / "max" (valor do pedido na moeda base).
 * null = serve. countries vazio = todos os países.
 */
export function methodBlock(row: PaymentMethodRow, countryCode: string, total: number): "inactive" | "country" | "min" | "max" | null {
  if (row.is_active === false) return "inactive";
  const list = (row.countries ?? []).map((c) => String(c).toUpperCase());
  if (list.length && !list.includes(String(countryCode).toUpperCase())) return "country";
  const min = num(row.min_total), max = num(row.max_total);
  if (min != null && total + 0.005 < min) return "min";
  if (max != null && max > 0 && total - 0.005 > max) return "max";
  return null;
}

/** Desconto do meio (0 a 50%) sobre o valor dos produtos já com o cupom; nunca sobre o frete. */
export function paymentDiscount(row: PaymentMethodRow, productsTotal: number): number {
  const pct = Math.min(50, Math.max(0, num(row.discount_percent) ?? 0));
  if (!pct || productsTotal <= 0) return 0;
  return round2(productsTotal * pct / 100);
}

/** Casas decimais da moeda (BRL e EUR 2, JPY 0). */
export const currencyDigits = (currency: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
export const toMinor = (amount: number, currency: string) => Math.round(amount * 10 ** currencyDigits(currency));
export const fromMinor = (minor: number, currency: string) => minor / 10 ** currencyDigits(currency);
