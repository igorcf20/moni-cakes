export type CustomizationPricingRule = {
  pricing_mode: "flat" | "per_cm2";
  base_price: number;
  price_per_cm2: number | null;
  min_price: number;
};

export type MaterialPricingRule = {
  pricing_mode?: "fixed" | "per_linear_meter";
  fixed_price?: number;
  price_per_meter?: number;
  calculation_dimension?: "width" | "height" | "longest_side";
};

export function calculateMaterialAddon(rule: MaterialPricingRule | undefined, widthCm: number, heightCm: number) {
  if (!rule) return 0;
  if (rule.pricing_mode !== "per_linear_meter") return Math.max(0, Number(rule.fixed_price) || 0);
  const width = Math.max(0, Number(widthCm) || 0);
  const height = Math.max(0, Number(heightCm) || 0);
  const usedCm = rule.calculation_dimension === "width"
    ? width
    : rule.calculation_dimension === "longest_side"
      ? Math.max(width, height)
      : height;
  return (usedCm / 100) * Math.max(0, Number(rule.price_per_meter) || 0);
}

export function calculateCustomizationAddon(
  rule: CustomizationPricingRule,
  widthCm: number,
  heightCm: number,
  materialRule?: MaterialPricingRule,
) {
  const material = calculateMaterialAddon(materialRule, widthCm, heightCm);
  if (rule.pricing_mode === "per_cm2") {
    const area = Math.max(0, Number(widthCm) || 0) * Math.max(0, Number(heightCm) || 0);
    const calculated = area * Math.max(0, Number(rule.price_per_cm2) || 0);
    return Math.max(calculated, Math.max(0, Number(rule.min_price) || 0)) + material;
  }
  return Math.max(0, Number(rule.base_price) || 0) + material;
}
