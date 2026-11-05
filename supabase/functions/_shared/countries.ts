// Configuração do país do pedido (tabela public.countries). Usado pelas Edge Functions para impostos e
// documento fiscal, sem confiar no navegador. Sem a tabela (migration ainda não aplicada), vale o Brasil.
import type { TaxIdKind } from "./taxId.ts";

export type ServerCountry = {
  code: string;
  currency: string;
  taxMode: "inclusive" | "vat";
  defaultTaxRate: number;
  shippingTaxRate: number;
  taxIdKind: TaxIdKind;
  taxIdRequired: boolean;
  /** Frete grátis a partir deste subtotal (centavos da moeda do país); null = sem frete grátis. */
  freeShippingFromCents: number | null;
};

const FALLBACK: ServerCountry = { code: "BR", currency: "BRL", taxMode: "inclusive", defaultTaxRate: 0, shippingTaxRate: 0, taxIdKind: "br_cpf_cnpj", taxIdRequired: true, freeShippingFromCents: null };

const fromRow = (r: any): ServerCountry => ({
  code: r.code, currency: r.currency, taxMode: r.tax_mode === "vat" ? "vat" : "inclusive",
  defaultTaxRate: Number(r.default_tax_rate) || 0, shippingTaxRate: Number(r.shipping_tax_rate) || 0,
  taxIdKind: r.tax_id_kind, taxIdRequired: !!r.tax_id_required,
  freeShippingFromCents: r.free_shipping_from_cents == null ? null : Number(r.free_shipping_from_cents),
});

/** País ativo pedido; sem código (ou inválido/inativo), o país padrão da loja. */
export async function loadCountry(sb: any, code?: string | null): Promise<ServerCountry | null> {
  const wanted = String(code ?? "").trim().toUpperCase();
  const { data, error } = await sb.from("countries").select("*").eq("is_active", true);
  if (error || !data?.length) return wanted && wanted !== FALLBACK.code ? null : FALLBACK;
  if (wanted) {
    const row = data.find((r: any) => r.code === wanted);
    return row ? fromRow(row) : null;
  }
  return fromRow(data.find((r: any) => r.is_default) ?? data[0]);
}

/** Taxa a somar ao preço líquido (0 em países com preço final, como o Brasil). */
export const lineTaxRate = (c: ServerCountry) => (c.taxMode === "vat" ? c.defaultTaxRate : 0);
export const shippingTaxRate = (c: ServerCountry) => (c.taxMode === "vat" ? c.shippingTaxRate : 0);
