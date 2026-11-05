// Produtos digitais (recurso digital_products; migration 20261007110000_digital_products.sql). Um produto digital
// sem entrega física (product_digital.ships = false) não pesa nem paga frete: a cotação (shipping/quote.ts) deixa-o
// de fora e o create-order não cobra frete quando o carrinho só tem produtos assim. O acesso aos arquivos nasce no
// banco quando o pedido fica pago.
type Sb = any;

/** Ids dos produtos digitais sem entrega física (conjunto vazio com o recurso desligado). */
export async function digitalOnlyIds(sb: Sb, productIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(productIds.map(String).filter(Boolean))];
  if (!ids.length) return new Set();
  const [{ data: on }, { data: rows }] = await Promise.all([
    sb.rpc("feature_enabled", { _key: "digital_products", _default: false }),
    sb.from("product_digital").select("product_id").in("product_id", ids).eq("is_active", true).eq("ships", false),
  ]);
  if (!on) return new Set();
  return new Set((rows ?? []).map((r: any) => String(r.product_id)));
}
