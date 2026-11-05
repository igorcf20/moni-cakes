// =====================================================================================
// Códigos do produto: SKU (products.sku, ou o da variante escolhida), código interno (products.internal_code, de
// controle da própria loja), código da marca ou do fabricante (products.mpn) e GTIN / EAN (products.gtin).
// A loja escolhe quais aparecem e onde (store_settings.product_codes, Admin > Catálogo > Códigos do produto):
//   top    linha pequena e discreta na página do produto, abaixo dos botões de compra
//   specs  na aba Especificações (descrição do produto)
//   both   nos dois lugares
//   off    não aparece ao cliente (o código continua no Admin, nos pedidos e no feed)
// Sem imports com @/ para o teste em node (scripts/test-product-codes.mjs).
// =====================================================================================

export const PRODUCT_CODES = ['sku', 'internal', 'mpn', 'gtin'] as const;
export type ProductCodeKind = (typeof PRODUCT_CODES)[number];
export type ProductCodePlace = 'top' | 'specs' | 'both' | 'off';

export type ProductCodesSettings = Record<ProductCodeKind, ProductCodePlace>;

/** Como as lojas já viam: SKU abaixo dos botões e na aba; o código interno é só da loja. */
export const DEFAULT_PRODUCT_CODES: ProductCodesSettings = { sku: 'both', internal: 'off', mpn: 'specs', gtin: 'off' };

const PLACES = ['top', 'specs', 'both', 'off'] as const;

export function normalizeProductCodes(raw: unknown): ProductCodesSettings {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_PRODUCT_CODES };
  for (const k of PRODUCT_CODES) {
    const v = r[k];
    if (typeof v === 'string' && (PLACES as readonly string[]).includes(v)) out[k] = v as ProductCodePlace;
  }
  return out;
}

export const showsAt = (place: ProductCodePlace, where: 'top' | 'specs') => place === 'both' || place === where;

/** Código interno: letras, números e - _ . / (até 64), como o SKU; vazio = sem código. */
export function normalizeInternalCode(v: string | null | undefined): string | null {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, 64) : null;
}
export const isValidInternalCode = (v: string | null | undefined) => {
  const s = String(v ?? '').trim();
  return !s || /^[A-Za-z0-9][A-Za-z0-9._\-/ ]{0,63}$/.test(s);
};

/** Código da marca (MPN): mais livre (o fabricante decide), até 70 caracteres visíveis. */
export function normalizeMpn(v: string | null | undefined): string | null {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, 70) : null;
}
export const isValidMpn = (v: string | null | undefined) => {
  const s = String(v ?? '').trim();
  return !s || (s.length <= 70 && /^[\p{L}\p{N}][\p{L}\p{N}._\-/#+ ]*$/u.test(s));
};

export type CodeValues = Partial<Record<ProductCodeKind, string | null | undefined>>;

/** Códigos a mostrar num lugar, pela ordem SKU, interno, marca, GTIN; só os preenchidos. */
export function codesFor(values: CodeValues, s: ProductCodesSettings, where: 'top' | 'specs'): { kind: ProductCodeKind; value: string }[] {
  return PRODUCT_CODES
    .filter((k) => showsAt(s[k], where))
    .map((k) => ({ kind: k, value: String(values[k] ?? '').trim() }))
    .filter((c) => c.value !== '');
}
