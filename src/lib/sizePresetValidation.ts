/** Erros com código estável (o Admin traduz: sizes_err_<código> em src/i18n/adminLegacy.ts). */
export const SIZE_PRESET_ERRORS = ["preset_name", "size_name", "size_duplicate", "size_price"] as const;

export type SizePresetValue = { label: string; defaultPriceAdjustment: number; displayOrder: number };

/** Validate and whitelist persisted JSON; UI-only draft keys must never reach the database. */
export function sizePresetPayload(name: string, values: SizePresetValue[]) {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("preset_name");
  const names = new Set<string>();
  const items = values.map((item, displayOrder) => {
    const label = item.label.trim();
    if (!label) throw new Error("size_name");
    const normalized = label.toLocaleLowerCase("pt-PT");
    if (names.has(normalized)) throw new Error("size_duplicate");
    names.add(normalized);
    const price = item.defaultPriceAdjustment;
    const cents = Math.round(price * 100);
    if (!Number.isFinite(price) || price < 0 || !Number.isSafeInteger(cents) || Math.abs(price * 100 - cents) > 0.000001) {
      throw new Error("size_price");
    }
    return { label, defaultPriceAdjustment: cents / 100, displayOrder };
  });
  return { name: normalizedName, sizes: items.map(item => item.label), items };
}
