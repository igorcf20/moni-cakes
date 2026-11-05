// Kit discount rules, shared by the cart (useCart) and mirrored on the server
// (supabase/functions/_shared/pricing.ts). A kit gives a percentage off every unit of its lines,
// but only while the cart holds every product of the kit in at least the kit's quantity.
// A fixed-value kit discount is turned into the equivalent percentage of the kit's list price.

export type KitTag = { id: string; name: string; pct: number; items: { product_id: string; quantity: number }[] };

export function kitPct(discountType: string, discountValue: number, listTotal: number): number {
  const value = Math.max(0, Number(discountValue) || 0);
  if (discountType === "percentage") return Math.min(1, value / 100);
  return listTotal > 0 ? Math.min(1, value / listTotal) : 0;
}

/** Ids of the kits whose products are all present (tagged with that kit) in the required quantity. */
export function completeKits(lines: { product_id: string; quantity: number; kit?: KitTag | null }[]): Set<string> {
  const complete = new Set<string>();
  const kits = new Map<string, KitTag>();
  for (const l of lines) if (l.kit?.id) kits.set(l.kit.id, l.kit);
  for (const [id, kit] of kits) {
    const ok = kit.items.length > 0 && kit.items.every((item) => {
      const have = lines.filter((l) => l.kit?.id === id && l.product_id === item.product_id).reduce((s, l) => s + l.quantity, 0);
      return have >= item.quantity;
    });
    if (ok) complete.add(id);
  }
  return complete;
}

/** Cart lines for "Comprar kit": every product tagged with the kit so the discount can be checked. */
export function kitCartItems(kit: { id: string; name: string; discount_type: string; discount_value: number }, items: any[]) {
  const parts = items.filter((i) => !!i.products?.id);
  const listTotal = parts.reduce((s, i) => s + (Number(i.products.price) || 0) * (Number(i.quantity) || 0), 0);
  const tag: KitTag = {
    id: kit.id,
    name: kit.name,
    pct: kitPct(kit.discount_type, kit.discount_value, listTotal),
    items: parts.map((i) => ({ product_id: String(i.products.id), quantity: Number(i.quantity) || 1 })),
  };
  return parts.map((i) => ({
    productId: String(i.products.id),
    quantity: Number(i.quantity) || 1,
    designData: { name: i.products.name, image: i.products.image, price: Number(i.products.price) || 0, kit: tag },
  }));
}

/** Escolha de uma peça na página do kit: cor e tamanho (opcionais) e o preço líquido já calculado como na página do produto. */
export type KitPieceChoice = {
  product: { id: string; name: string; image?: string | null; price: number | string; weight?: number | string | null };
  quantity: number;
  variationId?: string;
  variationName?: string;
  colorHex?: string | null;
  sizeLabel?: string;
  /** preço base líquido (promoção aplicada), acréscimo da cor e do tamanho e rácio da promoção nos escalões */
  basePrice: number;
  modifier: number;
  tierRatio: number;
  image?: string | null;
};

/**
 * Linhas do carrinho para um kit com escolhas (página /kit/<slug>): cada peça leva a marca do kit, a cor e o tamanho
 * (o servidor reconhece pelos nomes) e o selectionPricing, para o carrinho mostrar o mesmo preço que o servidor cobra.
 */
export function kitCartLines(kit: { id: string; name: string; discount_type: string; discount_value: number }, parts: KitPieceChoice[]) {
  const listTotal = parts.reduce((s, p) => s + (Number(p.product.price) || 0) * (Number(p.quantity) || 0), 0);
  const tag: KitTag = {
    id: kit.id,
    name: kit.name,
    pct: kitPct(kit.discount_type, kit.discount_value, listTotal),
    items: parts.map((p) => ({ product_id: String(p.product.id), quantity: Number(p.quantity) || 1 })),
  };
  return parts.map((p) => ({
    productId: String(p.product.id),
    quantity: Number(p.quantity) || 1,
    variationId: p.variationId,
    sizeLabel: p.sizeLabel,
    designData: {
      name: p.product.name,
      image: p.image || p.product.image || "",
      weight: Number(p.product.weight) || 0.5,
      price: p.basePrice + p.modifier,
      ...(p.variationName ? { variation: p.variationName, color: p.colorHex ?? undefined } : {}),
      ...(p.sizeLabel ? { size: p.sizeLabel } : {}),
      selectionPricing: { version: 1, basePrice: p.basePrice, modifier: p.modifier, tierRatio: p.tierRatio },
      kit: tag,
    },
  }));
}
