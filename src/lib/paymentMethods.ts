// Catálogo dos meios de pagamento que a loja sabe usar (Admin > Pagamentos, checkout e confirmação do pedido).
// Cada meio é uma linha em payment_config (ativo, países, desconto, valor mínimo e máximo, dados para o cliente).
//  - manual: o cliente paga fora do site (Pix por chave, transferência, MB WAY, Multibanco, Bizum, na entrega) e
//    a loja confirma o pagamento no pedido (com comprovante, se pedir).
//  - gateway: o cliente paga no provedor (Mercado Pago, Stripe, PayPal, Viva) e o servidor confirma sozinho na
//    API do provedor. As chaves ficam em Admin > Integrações.
// Meio novo = entrada aqui + tipo na CHECK de payment_config (migration) + textos em src/i18n/adminPayments.ts;
// se for gateway, também GATEWAYS em supabase/functions/_shared/payments/gateways.ts.
import type { LucideIcon } from "lucide-react";
import { Banknote, Building2, CreditCard, Globe2, Landmark, QrCode, Smartphone, Wallet } from "lucide-react";

export type PaymentType =
  | "pix" | "transfer" | "mbway" | "multibanco" | "bizum" | "on_delivery"
  | "mercado_pago" | "stripe" | "paypal" | "viva";

export type PaymentField = {
  key: string;
  /** Chave do rótulo em adminPayments (f_<key>). */
  required?: boolean;
  upper?: boolean;
  placeholder?: string;
};

export type PaymentCatalogEntry = {
  type: PaymentType;
  kind: "manual" | "gateway";
  icon: LucideIcon;
  /** Países sugeridos ao adicionar (o dono pode mudar). Vazio = todos. */
  countries: string[];
  /** Dados mostrados ao cliente para pagar (só meios manuais). */
  fields: PaymentField[];
  /** O cliente pode anexar o comprovante. */
  proof: boolean;
  /** Provedor em Admin > Integrações (meios gateway). */
  provider?: "mercado_pago" | "stripe" | "paypal" | "viva";
  /** Endereço do painel do provedor (criar conta, ver chaves). */
  site?: string;
};

export const PAYMENT_CATALOG: PaymentCatalogEntry[] = [
  { type: "mercado_pago", kind: "gateway", icon: QrCode, countries: ["BR"], fields: [], proof: false, provider: "mercado_pago", site: "https://www.mercadopago.com.br/developers/panel/app" },
  { type: "stripe", kind: "gateway", icon: CreditCard, countries: [], fields: [], proof: false, provider: "stripe", site: "https://dashboard.stripe.com/apikeys" },
  { type: "paypal", kind: "gateway", icon: Globe2, countries: [], fields: [], proof: false, provider: "paypal", site: "https://developer.paypal.com/dashboard/applications" },
  { type: "viva", kind: "gateway", icon: CreditCard, countries: ["PT", "ES"], fields: [], proof: false, provider: "viva", site: "https://www.viva.com" },
  {
    type: "pix", kind: "manual", icon: QrCode, countries: ["BR"], proof: true,
    fields: [{ key: "tipo_chave" }, { key: "chave_pix", required: true }, { key: "nome_titular" }, { key: "cidade_titular" }],
  },
  {
    type: "transfer", kind: "manual", icon: Landmark, countries: [], proof: true,
    fields: [
      { key: "banco", required: true }, { key: "nome_titular", required: true }, { key: "iban", upper: true }, { key: "bic", upper: true },
      { key: "agencia" }, { key: "conta" }, { key: "nif" },
    ],
  },
  { type: "mbway", kind: "manual", icon: Smartphone, countries: ["PT"], proof: true, fields: [{ key: "telemovel", required: true, placeholder: "912 345 678" }] },
  { type: "multibanco", kind: "manual", icon: Building2, countries: ["PT"], proof: true, fields: [{ key: "entidade", required: true, placeholder: "12345" }, { key: "referencia_modelo" }] },
  { type: "bizum", kind: "manual", icon: Smartphone, countries: ["ES"], proof: true, fields: [{ key: "telefone", required: true, placeholder: "612 345 678" }, { key: "nome_titular" }] },
  { type: "on_delivery", kind: "manual", icon: Wallet, countries: [], proof: false, fields: [] },
];

export const paymentEntry = (type: string): PaymentCatalogEntry | undefined => PAYMENT_CATALOG.find((m) => m.type === type);
export const paymentIconOf = (type: string): LucideIcon => paymentEntry(type)?.icon ?? Banknote;
/** Meios em que o site abre o pagamento no provedor (payment-start); a Viva tem o fluxo próprio. */
export const ONLINE_GATEWAYS = ["mercado_pago", "stripe", "paypal"] as const;
export const isOnlineGateway = (type: string | null | undefined) => (ONLINE_GATEWAYS as readonly string[]).includes(String(type ?? ""));

export type PaymentMethodRow = {
  type: string;
  is_active?: boolean | null;
  countries?: string[] | null;
  discount_percent?: number | string | null;
  min_total?: number | string | null;
  max_total?: number | string | null;
};

const num = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Mesma regra de supabase/functions/_shared/payments/methods.ts (methodBlock), comparada no teste
 * scripts/test-payments.mjs: "inactive", "country", "min", "max" ou null quando o meio serve.
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

/** Desconto do meio (só para mostrar; o servidor calcula o valor gravado). */
export function paymentDiscount(row: PaymentMethodRow | undefined, productsTotal: number): number {
  const pct = Math.min(50, Math.max(0, num(row?.discount_percent) ?? 0));
  if (!pct || productsTotal <= 0) return 0;
  return Math.round(productsTotal * pct) / 100;
}

/** Nome / instruções no idioma do cliente: tradução gravada no Admin, senão o texto padrão do idioma, senão o nome gravado. */
export const localized = (i18n: Record<string, string> | null | undefined, locale: string, fallback: string) =>
  String(i18n?.[locale] ?? "").trim() || fallback;
