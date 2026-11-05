export const parseMoneyInput = (value: string | number, precision = 2): number | null => {
  if (!Number.isInteger(precision) || precision < 0 || precision > 4) return null;
  // Reject internal whitespace: "1 2" must never silently become twelve euros.
  const normalized = String(value).trim().replace(",", ".");
  const pattern = precision === 0 ? /^\d+$/ : new RegExp("^\\d+(?:\\.\\d{1," + precision + "})?$");
  if (!normalized || !pattern.test(normalized)) return null;
  const parsed = Number(normalized);
  const factor = 10 ** precision;
  return Number.isFinite(parsed) && Number.isSafeInteger(Math.round(parsed * factor))
    ? Math.round(parsed * factor) / factor : null;
};

export const moneyInputValue = (value: number | null | undefined): string =>
  Number(value ?? 0).toFixed(2);
