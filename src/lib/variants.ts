// =============================================================================================
// Variantes (recurso variants em Admin > Recursos da loja): cada combinação vendável de um produto com o seu
// código (SKU), código de barras (GTIN/EAN), estoque e foto. Regras puras, usadas pela aba Variantes do produto
// no Admin e pela página do produto. O servidor repete o formato e a unicidade do código
// (migration 20261006220000_product_variants.sql) e grava o código vendido em order_items.sku.
//   - cor x tamanho: linha de product_variation_size_availability (estoque, foto, código)
//   - só cores: product_variations (estoque vazio = usa o estoque do produto)
//   - só tamanhos: product_sizes
//   - nem cores nem tamanhos: o próprio produto
// Teste: node --experimental-strip-types scripts/test-variants.mjs
// =============================================================================================

export type VariantKind = 'combo' | 'color' | 'size' | 'product';

export type VariantColor = { id: string; name: string; color_hex?: string | null; image_url?: string | null; sku?: string | null; gtin?: string | null; stock_quantity?: number | null };
export type VariantSize = { id: string; size_label: string; sku?: string | null; gtin?: string | null; stock_quantity?: number | null };
export type VariantCombo = {
  variation_id: string; product_size_id: string; is_available: boolean; stock_quantity: number | null;
  price_modifier?: number | null; sku?: string | null; gtin?: string | null; image_url?: string | null;
};
export type VariantProduct = { id: string; name?: string; sku?: string | null; gtin?: string | null; stock_quantity?: number | null };

export type VariantRow = {
  key: string;
  kind: VariantKind;
  variationId: string | null;
  sizeId: string | null;
  colorName: string | null;
  colorHex: string | null;
  sizeLabel: string | null;
  sku: string | null;
  gtin: string | null;
  /** null = sem estoque próprio (cor que usa o estoque do produto) */
  stock: number | null;
  available: boolean;
  image: string | null;
  /** foto própria da combinação (sem a reserva da cor) */
  ownImage: string | null;
  /** combinação ainda sem linha na matriz (valores padrão) */
  isDefault: boolean;
};

const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const int = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.floor(Number(v))));

/* ---------- Códigos ---------- */

export const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/;

export const normalizeSku = (v: unknown): string | null => clean(v);
export const isValidSku = (v: unknown): boolean => { const s = normalizeSku(v); return s == null || SKU_RE.test(s); };
export const normalizeGtin = (v: unknown): string | null => (typeof v === 'string' && v.replace(/\s/g, '') ? v.replace(/\s/g, '') : null);
export const isValidGtin = (v: unknown): boolean => { const g = normalizeGtin(v); return g == null || /^[0-9]{8,14}$/.test(g); };

/** Dígito verificador GS1 (EAN-8, UPC-A, EAN-13, GTIN-14). Só um aviso: o servidor aceita qualquer 8 a 14 dígitos. */
export function gtinChecksumOk(v: unknown): boolean {
  const g = normalizeGtin(v);
  if (!g || !/^[0-9]{8,14}$/.test(g) || ![8, 12, 13, 14].includes(g.length)) return false;
  const digits = g.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Parte de um código: sem acentos, maiúsculas, só letras e números (ex.: "Azul claro" -> "AZULCLARO"). */
export function skuPart(v: string): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 16);
}

/** Código sugerido: base do produto + cor + tamanho (ex.: VASO-PRETO-M). */
export function suggestSku(base: string, parts: (string | null | undefined)[]): string {
  const head = skuPart(base) || 'SKU';
  const tail = parts.map((p) => (p ? skuPart(p) : '')).filter(Boolean);
  return [head, ...tail].join('-').slice(0, 64);
}

/** Base para códigos: o SKU do produto, senão o id. */
export const skuBase = (p: VariantProduct) => normalizeSku(p.sku) || p.id;

/* ---------- Linhas ---------- */

/** Todas as variantes do produto, na ordem das cores e dos tamanhos. */
export function variantRows(product: VariantProduct, colors: VariantColor[], sizes: VariantSize[], combos: VariantCombo[]): VariantRow[] {
  const base = { colorName: null, colorHex: null, sizeLabel: null, variationId: null, sizeId: null, isDefault: false, ownImage: null };
  if (colors.length && sizes.length) {
    const map = new Map(combos.map((c) => [`${c.variation_id}:${c.product_size_id}`, c]));
    return colors.flatMap((c) => sizes.map((s) => {
      const m = map.get(`${c.id}:${s.id}`);
      return {
        ...base,
        key: `${c.id}:${s.id}`, kind: 'combo' as const,
        variationId: c.id, sizeId: s.id, colorName: c.name, colorHex: c.color_hex ?? null, sizeLabel: s.size_label,
        sku: clean(m?.sku), gtin: clean(m?.gtin),
        // Sem linha na matriz, o site usa o estoque do tamanho (useProductPage.sizeOptionsFor).
        stock: m ? int(m.stock_quantity) ?? 0 : int(s.stock_quantity) ?? 0,
        available: m ? m.is_available !== false : true,
        image: clean(m?.image_url) ?? clean(c.image_url),
        ownImage: clean(m?.image_url),
        isDefault: !m,
      };
    }));
  }
  if (colors.length) {
    return colors.map((c) => ({
      ...base, key: `v:${c.id}`, kind: 'color' as const, variationId: c.id, colorName: c.name, colorHex: c.color_hex ?? null,
      sku: clean(c.sku), gtin: clean(c.gtin), stock: int(c.stock_quantity), available: true, image: clean(c.image_url),
    }));
  }
  if (sizes.length) {
    return sizes.map((s) => ({
      ...base, key: `s:${s.id}`, kind: 'size' as const, sizeId: s.id, sizeLabel: s.size_label,
      sku: clean(s.sku), gtin: clean(s.gtin), stock: int(s.stock_quantity) ?? 0, available: true, image: null,
    }));
  }
  return [{ ...base, key: `p:${product.id}`, kind: 'product', sku: clean(product.sku), gtin: clean(product.gtin), stock: int(product.stock_quantity), available: true, image: null }];
}

export const variantLabel = (r: VariantRow) => [r.colorName, r.sizeLabel].filter(Boolean).join(' / ');

/** Estoque efetivo da linha (cor sem estoque próprio usa o do produto). */
export const rowStock = (r: VariantRow, productStock: number | null | undefined) => (r.stock ?? int(productStock));

export type VariantSummary = { total: number; stock: number; soldOut: number; low: number; missingSku: number; unavailable: number };

/** Números do topo da aba: variantes, estoque somado, esgotadas, com pouco estoque (1 a lowAt) e sem código. */
export function variantSummary(rows: VariantRow[], productStock: number | null | undefined, lowAt = 5): VariantSummary {
  let stock = 0, soldOut = 0, low = 0, missingSku = 0, unavailable = 0;
  const sharedStock = rows.some((r) => r.kind === 'color' && r.stock == null);
  for (const r of rows) {
    if (!r.sku) missingSku += 1;
    if (!r.available) { unavailable += 1; continue; }
    const s = rowStock(r, productStock);
    if (s == null) continue;
    if (r.stock != null || !sharedStock) stock += s;
    if (s <= 0) soldOut += 1;
    else if (s <= lowAt) low += 1;
  }
  // Cores que partilham o estoque do produto contam esse estoque uma vez só.
  if (sharedStock && int(productStock) != null) stock += int(productStock)!;
  return { total: rows.length, stock, soldOut, low, missingSku, unavailable };
}

/** Códigos para as linhas sem código, sem repetir os que já existem (nem entre si). */
export function fillMissingSkus(rows: VariantRow[], base: string, taken: Iterable<string> = []): Map<string, string> {
  const used = new Set([...taken].map((s) => s.toLowerCase()));
  rows.forEach((r) => { if (r.sku) used.add(r.sku.toLowerCase()); });
  const out = new Map<string, string>();
  for (const r of rows) {
    if (r.sku) continue;
    const first = suggestSku(base, r.kind === 'product' ? [] : [r.colorName, r.sizeLabel]);
    let candidate = first;
    for (let n = 2; used.has(candidate.toLowerCase()); n += 1) candidate = `${first.slice(0, 60)}-${n}`;
    used.add(candidate.toLowerCase());
    out.set(r.key, candidate);
  }
  return out;
}

/** Variante escolhida na página do produto (null enquanto a escolha não estiver completa). */
export function pickVariant(rows: VariantRow[], variationId: string | null | undefined, sizeId: string | null | undefined): VariantRow | null {
  if (!rows.length) return null;
  const kind = rows[0].kind;
  if (kind === 'product') return rows[0];
  if (kind === 'combo') return variationId && sizeId ? rows.find((r) => r.variationId === variationId && r.sizeId === sizeId) ?? null : null;
  if (kind === 'color') return variationId ? rows.find((r) => r.variationId === variationId) ?? null : null;
  return sizeId ? rows.find((r) => r.sizeId === sizeId) ?? null : null;
}

/* ---------- CSV ---------- */

export const VARIANT_CSV_COLUMNS = ['variant', 'sku', 'gtin', 'stock', 'available'] as const;

export function variantCsvRows(rows: VariantRow[], productStock: number | null | undefined, productName: string) {
  return rows.map((r) => ({
    variant: variantLabel(r) || productName,
    sku: r.sku ?? '',
    gtin: r.gtin ?? '',
    stock: rowStock(r, productStock) ?? '',
    available: r.available ? 1 : 0,
  }));
}
