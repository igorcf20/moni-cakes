export type CartSelectionItem = {
  productId: string;
  quantity: number;
  variationId?: string;
  sizeLabel?: string;
  designData: Record<string, any>;
};

/** Preserve the original artwork payload; a size selection is a single write. */
export function prepareCartSelection(items: CartSelectionItem[]) {
  if (!items.length || items.some(i => !i.productId || !Number.isSafeInteger(i.quantity) || i.quantity < 1
    || !Number.isFinite(i.designData?.price) || i.designData.price < 0)) {
    throw new Error("Seleção, quantidades ou preços inválidos.");
  }
  return items.map(i => ({ product_id: i.productId, quantity: i.quantity,
    variation_id: i.variationId, size_label: i.sizeLabel, design_data: i.designData }));
}
