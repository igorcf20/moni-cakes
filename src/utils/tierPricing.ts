/**
 * Volume tier pricing — shared helper used by the cart, checkout and product
 * detail page so that the price the customer sees and the price stored in the
 * order always come from the same calculation.
 *
 * Tiers are stored in `product_volume_tiers` with `min_meters` / `price_per_meter`.
 * The same table is reused for products sold by unit: `min_meters` is then
 * interpreted as the minimum quantity and `price_per_meter` as the unit price.
 *
 * Rules (per product, never summing across different products):
 *  - pick the tier with the highest `min_meters` (a.k.a. min qty) that is
 *    still ≤ the quantity being purchased;
 *  - if no tier applies (qty < smallest min), fall back to `basePrice`.
 */

export interface VolumeTier {
  min_meters: number;
  price_per_meter: number;
  label?: string | null;
}

export interface AppliedTier {
  min: number;
  unitPrice: number;
  label?: string | null;
}

export const pickTier = (
  quantity: number,
  tiers: VolumeTier[] | undefined | null,
): AppliedTier | null => {
  if (!tiers || tiers.length === 0 || !Number.isFinite(quantity) || quantity <= 0) return null;
  const sorted = [...tiers]
    .filter((t) => Number.isFinite(Number(t.min_meters)) && Number.isFinite(Number(t.price_per_meter)))
    .sort((a, b) => Number(a.min_meters) - Number(b.min_meters));
  let best: AppliedTier | null = null;
  for (const t of sorted) {
    const min = Number(t.min_meters);
    if (quantity + 1e-9 >= min) {
      best = { min, unitPrice: Number(t.price_per_meter), label: t.label ?? null };
    }
  }
  return best;
};

/** Returns the effective per-unit (or per-meter) price for a given quantity. */
export const effectiveUnitPrice = (
  basePrice: number,
  quantity: number,
  tiers: VolumeTier[] | undefined | null,
): { unit: number; tier: AppliedTier | null } => {
  const tier = pickTier(quantity, tiers);
  const unit = tier ? tier.unitPrice : Number(basePrice || 0);
  return { unit, tier };
};