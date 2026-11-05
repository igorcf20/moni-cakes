/**
 * Product promotions helper.
 *
 * A promotion is configured directly on the product (`products.promo_*` columns).
 * When active, the promotional price becomes the new *base* price — variation and
 * size modifiers are added *on top* of the promotional value.
 *
 * States:
 *   - null        → no promo configured / disabled
 *   - scheduled   → configured but starts in the future
 *   - active      → currently applying (affects displayed & cart price)
 *   - expired     → had an end date that already passed
 */

export type PromoType = "percentage" | "fixed";

export interface ProductPromoInput {
  price?: number | string | null;
  price_per_meter?: number | string | null;
  unit_type?: string | null;
  promo_active?: boolean | null;
  promo_type?: PromoType | string | null;
  promo_value?: number | string | null;
  promo_label?: string | null;
  promo_starts_at?: string | null;
  promo_ends_at?: string | null;
  promo_show_countdown?: boolean | null;
}

export interface ProductPromo {
  isActive: boolean;
  isScheduled: boolean;
  isExpired: boolean;
  type: PromoType;
  value: number;
  label: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  showCountdown: boolean;
  /** Original list price (net, without VAT). */
  basePrice: number;
  /** Effective base price after applying the promo (net). */
  effectivePrice: number;
  /** Absolute discount off the base price (net). */
  discountAmount: number;
  /** Discount as a percentage of the base price (0–100). */
  discountPct: number;
}

const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const parseDate = (v?: string | null): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Compute the promo state for a product. Returns `null` when the product has
 * no promo configured — callers can then use the raw `product.price`.
 */
export function getProductPromo(
  product: ProductPromoInput | null | undefined,
  now: Date = new Date(),
): ProductPromo | null {
  if (!product || !product.promo_active) return null;

  const rawType = String(product.promo_type || "").toLowerCase();
  const type: PromoType = rawType === "fixed" ? "fixed" : "percentage";
  const value = toNum(product.promo_value);
  if (value <= 0) return null;

  const isMeter = product.unit_type === "meter";
  const basePrice = isMeter
    ? toNum(product.price_per_meter ?? product.price)
    : toNum(product.price);
  if (basePrice <= 0) return null;

  const startsAt = parseDate(product.promo_starts_at);
  const endsAt = parseDate(product.promo_ends_at);

  const isScheduled = !!startsAt && startsAt.getTime() > now.getTime();
  const isExpired = !!endsAt && endsAt.getTime() <= now.getTime();
  const isActive = !isScheduled && !isExpired;

  const discountAmount =
    type === "percentage"
      ? Math.min(basePrice, (basePrice * value) / 100)
      : Math.min(basePrice, value);
  const effectivePrice = Math.max(0, basePrice - discountAmount);
  const discountPct = basePrice > 0 ? (discountAmount / basePrice) * 100 : 0;

  return {
    isActive,
    isScheduled,
    isExpired,
    type,
    value,
    label: product.promo_label?.trim() || null,
    startsAt,
    endsAt,
    showCountdown: product.promo_show_countdown !== false,
    basePrice,
    effectivePrice,
    discountAmount,
    discountPct,
  };
}

/**
 * Convenience: returns the price to use as the new *base* for variation math.
 * Falls back to the raw base price when the promo is inactive/scheduled/expired.
 */
export function getEffectiveBasePrice(product: ProductPromoInput | null | undefined): number {
  const promo = getProductPromo(product);
  const isMeter = product?.unit_type === "meter";
  const raw = isMeter
    ? toNum(product?.price_per_meter ?? product?.price)
    : toNum(product?.price);
  return promo?.isActive ? promo.effectivePrice : raw;
}

/** Short human badge, e.g. "-15%" or "-5,00 €". */
export function formatPromoBadge(promo: ProductPromo): string {
  if (promo.type === "percentage") {
    return `-${Math.round(promo.discountPct)}%`;
  }
  return `-${promo.discountAmount.toLocaleString("pt-PT", {
    style: "currency",
    currency: "EUR",
  })}`;
}