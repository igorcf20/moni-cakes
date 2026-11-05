// =============================================================================================
// Etiquetas de produto e leitura de códigos (recursos barcode_labels e barcode_stock; Admin > Estoque).
//   Unidades de estoque: o produto, cada cor, cada tamanho e cada cor x tamanho com estoque próprio, cada uma com os
//   seus códigos (SKU, GTIN; código interno e da marca são do produto). Usadas nas etiquetas (Admin > Estoque >
//   Etiquetas de código de barras) e na leitura por leitor (Admin > Estoque > Entradas e conferência).
//   Modelos de etiqueta (rolo de impressora térmica, folhas A4 e Carta, medidas próprias) e o que vai em cada uma:
//   padrão em store_settings.barcode_labels (normalizeLabelSettings). productLabelsHtml monta o HTML que se imprime
//   (printHtml de src/lib/printWindow.ts) e que a prévia mostra. Códigos desenhados por src/lib/barcode.ts.
// Base: rascunho da thread de preços (labels.ts e printDocs.ts). Sem imports com @/.
// Teste: node --experimental-strip-types scripts/test-barcode-stock.mjs
// =============================================================================================
import { barcodeModules, barcodeSvg } from './barcode.ts';

/* ---------- modelos ---------- */

export type LabelPresetId =
  | 'roll_30x20' | 'roll_40x25' | 'roll_50x30' | 'roll_60x40' | 'roll_100x50'
  | 'a4_3x7' | 'a4_3x8' | 'a4_5x13' | 'letter_3x10'
  | 'custom_roll' | 'custom_sheet';

export type PaperSize = 'a4' | 'letter';
export const PAPER_MM: Record<PaperSize, { w: number; h: number }> = { a4: { w: 210, h: 297 }, letter: { w: 215.9, h: 279.4 } };

/** Folha: papel, colunas x linhas, tamanho da etiqueta, margens de cima e da esquerda e espaço entre etiquetas (mm). */
export type SheetLayout = { paper: PaperSize; cols: number; rows: number; w: number; h: number; top: number; left: number; gapX: number; gapY: number };
export type LabelPreset = { id: LabelPresetId; kind: 'roll' | 'sheet'; w: number; h: number; sheet?: SheetLayout };

// Folhas comuns no Brasil e em Portugal (Pimaco, Avery, Colacril e similares); o nome mostra só as medidas.
export const LABEL_PRESETS: LabelPreset[] = [
  { id: 'roll_30x20', kind: 'roll', w: 30, h: 20 },
  { id: 'roll_40x25', kind: 'roll', w: 40, h: 25 },
  { id: 'roll_50x30', kind: 'roll', w: 50, h: 30 },
  { id: 'roll_60x40', kind: 'roll', w: 60, h: 40 },
  { id: 'roll_100x50', kind: 'roll', w: 100, h: 50 },
  { id: 'a4_3x7', kind: 'sheet', w: 63.5, h: 38.1, sheet: { paper: 'a4', cols: 3, rows: 7, w: 63.5, h: 38.1, top: 15.15, left: 7.2, gapX: 2.5, gapY: 0 } },
  { id: 'a4_3x8', kind: 'sheet', w: 70, h: 37, sheet: { paper: 'a4', cols: 3, rows: 8, w: 70, h: 37, top: 0.5, left: 0, gapX: 0, gapY: 0 } },
  { id: 'a4_5x13', kind: 'sheet', w: 38.1, h: 21.2, sheet: { paper: 'a4', cols: 5, rows: 13, w: 38.1, h: 21.2, top: 10.7, left: 4.75, gapX: 2.5, gapY: 0 } },
  { id: 'letter_3x10', kind: 'sheet', w: 66.7, h: 25.4, sheet: { paper: 'letter', cols: 3, rows: 10, w: 66.7, h: 25.4, top: 12.7, left: 4.8, gapX: 3.15, gapY: 0 } },
  { id: 'custom_roll', kind: 'roll', w: 50, h: 30 },
  { id: 'custom_sheet', kind: 'sheet', w: 70, h: 37 },
];

export const LABEL_FIELDS = ['name', 'variant', 'price', 'code', 'barcode', 'store'] as const;
export type LabelField = (typeof LABEL_FIELDS)[number];

/** Qual código vira código de barras; se faltar, usa o seguinte (GTIN, SKU, interno, id do produto). */
export const CODE_SOURCES = ['auto', 'gtin', 'sku', 'internal'] as const;
export type CodeSource = (typeof CODE_SOURCES)[number];

export type LabelSettings = {
  preset: LabelPresetId;
  /** Medidas do tamanho personalizado (rolo ou folha). */
  custom: { w: number; h: number; sheet: SheetLayout };
  fields: Record<LabelField, boolean>;
  codeSource: CodeSource;
  textSize: 'sm' | 'md' | 'lg';
  align: 'center' | 'left';
  /** Contorno fino em volta de cada etiqueta (ajuda a cortar em papel comum). */
  outline: boolean;
};

export const DEFAULT_LABEL_SETTINGS: LabelSettings = {
  preset: 'roll_50x30',
  custom: { w: 50, h: 30, sheet: { paper: 'a4', cols: 3, rows: 8, w: 70, h: 37, top: 0.5, left: 0, gapX: 0, gapY: 0 } },
  fields: { name: true, variant: true, price: true, code: true, barcode: true, store: false },
  codeSource: 'auto',
  textSize: 'md',
  align: 'center',
  outline: false,
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : dflt;
};

function normalizeSheet(raw: unknown, d: SheetLayout): SheetLayout {
  const s = obj(raw);
  return {
    paper: s.paper === 'letter' || s.paper === 'a4' ? s.paper : d.paper,
    cols: Math.round(num(s.cols, 1, 10, d.cols)),
    rows: Math.round(num(s.rows, 1, 30, d.rows)),
    w: num(s.w, 15, 210, d.w),
    h: num(s.h, 10, 280, d.h),
    top: num(s.top, 0, 100, d.top),
    left: num(s.left, 0, 100, d.left),
    gapX: num(s.gapX, 0, 30, d.gapX),
    gapY: num(s.gapY, 0, 30, d.gapY),
  };
}

export function normalizeLabelSettings(raw: unknown): LabelSettings {
  const r = obj(raw);
  const d = DEFAULT_LABEL_SETTINGS;
  const c = obj(r.custom);
  const f = obj(r.fields);
  return {
    preset: LABEL_PRESETS.some((p) => p.id === r.preset) ? (r.preset as LabelPresetId) : d.preset,
    custom: { w: num(c.w, 15, 210, d.custom.w), h: num(c.h, 10, 280, d.custom.h), sheet: normalizeSheet(c.sheet, d.custom.sheet) },
    fields: Object.fromEntries(LABEL_FIELDS.map((k) => [k, typeof f[k] === 'boolean' ? f[k] : d.fields[k]])) as Record<LabelField, boolean>,
    codeSource: CODE_SOURCES.includes(r.codeSource as CodeSource) ? (r.codeSource as CodeSource) : d.codeSource,
    textSize: r.textSize === 'sm' || r.textSize === 'lg' ? r.textSize : 'md',
    align: r.align === 'left' ? 'left' : 'center',
    outline: r.outline === true,
  };
}

export type LabelGeometry = { kind: 'roll' | 'sheet'; w: number; h: number; sheet: SheetLayout | null };

/** Tamanho efetivo (o personalizado usa as medidas gravadas). */
export function labelGeometry(s: LabelSettings): LabelGeometry {
  const p = LABEL_PRESETS.find((x) => x.id === s.preset) ?? LABEL_PRESETS[2];
  if (p.id === 'custom_roll') return { kind: 'roll', w: s.custom.w, h: s.custom.h, sheet: null };
  if (p.id === 'custom_sheet') return { kind: 'sheet', w: s.custom.sheet.w, h: s.custom.sheet.h, sheet: s.custom.sheet };
  return { kind: p.kind, w: p.w, h: p.h, sheet: p.sheet ?? null };
}

export const labelsPerPage = (g: LabelGeometry) => (g.sheet ? g.sheet.cols * g.sheet.rows : 1);

/** A folha cabe no papel? (margem + colunas x largura + espaços) */
export function sheetFits(sh: SheetLayout): boolean {
  const paper = PAPER_MM[sh.paper];
  const width = sh.left + sh.cols * sh.w + (sh.cols - 1) * sh.gapX;
  const height = sh.top + sh.rows * sh.h + (sh.rows - 1) * sh.gapY;
  return width <= paper.w + 0.01 && height <= paper.h + 0.01;
}

/* ---------- unidades de estoque ---------- */

export type ProductRow = {
  id: string; name: string; price: number | null; stock_quantity: number | null; image?: string | null;
  sku?: string | null; gtin?: string | null; internal_code?: string | null; mpn?: string | null; is_active?: boolean | null;
};
export type VariationRow = { id: string; product_id: string; name: string; price_modifier?: number | null; stock_quantity?: number | null; sku?: string | null; gtin?: string | null };
export type SizeRow = { id: string; product_id: string; size_label: string; price_modifier?: number | null; stock_quantity?: number | null; sku?: string | null; gtin?: string | null };
export type MatrixRow = { variation_id: string; product_size_id: string; price_modifier?: number | null; stock_quantity?: number | null; sku?: string | null; gtin?: string | null };

export type StockUnit = {
  key: string;
  productId: string;
  variationId: string | null;
  sizeId: string | null;
  name: string;
  variant: string | null;
  /** Preço sem imposto (preço do produto + acréscimos da cor e do tamanho). */
  price: number;
  stock: number | null;
  image: string | null;
  sku: string | null;
  /** O SKU vem do produto ou da cor (a unidade não tem SKU próprio). */
  skuInherited: boolean;
  gtin: string | null;
  internalCode: string | null;
  mpn: string | null;
};

const clean = (v: unknown) => { const s = String(v ?? '').trim(); return s || null; };
const n0 = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * Todas as unidades com estoque próprio, pela ordem: produto, cores, tamanhos, cor x tamanho (só as linhas da matriz).
 * O produto entra sempre (é o estoque quando não há cor nem tamanho com estoque próprio).
 */
export function buildStockUnits(products: ProductRow[], variations: VariationRow[], sizes: SizeRow[], matrix: MatrixRow[]): StockUnit[] {
  const out: StockUnit[] = [];
  const vById = new Map(variations.map((v) => [v.id, v]));
  const sById = new Map(sizes.map((s) => [s.id, s]));
  const byProduct = <T extends { product_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.product_id, [...(m.get(r.product_id) ?? []), r]);
    return m;
  };
  const vars = byProduct(variations);
  const szs = byProduct(sizes);
  const mtx = new Map<string, MatrixRow[]>();
  for (const m of matrix) {
    const pid = vById.get(m.variation_id)?.product_id;
    if (pid) mtx.set(pid, [...(mtx.get(pid) ?? []), m]);
  }
  for (const p of products) {
    const base = { productId: p.id, name: p.name, image: clean(p.image), internalCode: clean(p.internal_code), mpn: clean(p.mpn) };
    out.push({ ...base, key: `p:${p.id}`, variationId: null, sizeId: null, variant: null, price: n0(p.price), stock: p.stock_quantity ?? null, sku: clean(p.sku), skuInherited: false, gtin: clean(p.gtin) });
    for (const v of vars.get(p.id) ?? []) {
      out.push({ ...base, key: `v:${v.id}`, variationId: v.id, sizeId: null, variant: v.name, price: n0(p.price) + n0(v.price_modifier), stock: v.stock_quantity ?? null, sku: clean(v.sku) ?? clean(p.sku), skuInherited: !clean(v.sku), gtin: clean(v.gtin) });
    }
    for (const s of szs.get(p.id) ?? []) {
      out.push({ ...base, key: `s:${s.id}`, variationId: null, sizeId: s.id, variant: s.size_label, price: n0(p.price) + n0(s.price_modifier), stock: s.stock_quantity ?? null, sku: clean(s.sku) ?? clean(p.sku), skuInherited: !clean(s.sku), gtin: clean(s.gtin) });
    }
    for (const m of mtx.get(p.id) ?? []) {
      const v = vById.get(m.variation_id);
      const s = sById.get(m.product_size_id);
      if (!v || !s || s.product_id !== p.id) continue;
      out.push({
        ...base, key: `m:${v.id}:${s.id}`, variationId: v.id, sizeId: s.id, variant: `${v.name} / ${s.size_label}`,
        price: n0(p.price) + n0(v.price_modifier) + n0(s.price_modifier) + n0(m.price_modifier),
        stock: m.stock_quantity ?? null, sku: clean(m.sku) ?? clean(v.sku) ?? clean(s.sku) ?? clean(p.sku), skuInherited: !clean(m.sku), gtin: clean(m.gtin),
      });
    }
  }
  return out;
}

/** Valor do código de barras de uma unidade: o escolhido, senão GTIN, SKU, código interno e por fim o id do produto. */
export function labelCode(u: Pick<StockUnit, 'gtin' | 'sku' | 'internalCode' | 'productId'>, source: CodeSource): string {
  if (source === 'gtin' && u.gtin) return u.gtin;
  if (source === 'sku' && u.sku) return u.sku;
  if (source === 'internal' && u.internalCode) return u.internalCode;
  return u.gtin ?? u.sku ?? u.internalCode ?? u.productId;
}

/** A unidade só tem o id do produto como código (vale para ler, mas o ideal é um SKU ou GTIN). */
export const usesProductId = (u: StockUnit, source: CodeSource) => labelCode(u, source) === u.productId && !u.gtin && !u.sku && !u.internalCode;

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
/** Chave de comparação: código só de dígitos (8 a 14) perde os zeros à esquerda, para o GTIN-12 (UPC) valer com ou sem o 0. */
const canon = (s: string) => { const k = key(s); return /^\d{8,14}$/.test(k) ? k.replace(/^0+/, '') : k; };

/**
 * Unidade lida pelo leitor: procura GTIN (com ou sem o 0 de UPC), SKU, código interno, código da marca e id do produto.
 * O GTIN decide primeiro. Num SKU, a unidade que o tem como próprio vale mais que as que só o herdam (a cor herda do produto,
 * a combinação herda da cor); se só há herdados, vale a menos específica.
 */
export function findUnitByCode(units: StockUnit[], code: string): StockUnit | null {
  const c = canon(code);
  if (!c) return null;
  const is = (field: string | null) => !!field && canon(field) === c;
  const rank = (u: StockUnit) => (u.variationId && u.sizeId ? 0 : u.variationId || u.sizeId ? 1 : 2);
  const byGtin = units.find((u) => is(u.gtin));
  if (byGtin) return byGtin;
  const bySku = units.filter((u) => is(u.sku));
  if (bySku.length) {
    const own = bySku.filter((u) => !u.skuInherited);
    if (own.length) return own.sort((a, b) => rank(a) - rank(b))[0];
    return [...bySku].sort((a, b) => rank(b) - rank(a))[0];
  }
  return units.find((u) => !u.variationId && !u.sizeId && (is(u.internalCode) || is(u.mpn) || canon(u.productId) === c)) ?? null;
}

/** Busca por texto (nome, variante ou qualquer código), para escolher à mão. */
export function searchUnits(units: StockUnit[], q: string, limit = 30): StockUnit[] {
  const n = (s: string | null) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const words = n(q).split(/\s+/).filter(Boolean);
  if (!words.length) return units.slice(0, limit);
  return units.filter((u) => {
    const hay = [u.name, u.variant, u.sku, u.gtin, u.internalCode, u.mpn].map(n).join(' ');
    return words.every((w) => hay.includes(w));
  }).slice(0, limit);
}

/* ---------- impressão ---------- */

/** Lista de etiquetas (uma por cópia) com as posições vazias do início da primeira folha (etiquetas já usadas). */
export function labelSlots<T>(items: { item: T; copies: number }[], skip = 0): (T | null)[] {
  const out: (T | null)[] = Array.from({ length: Math.max(0, Math.floor(skip)) }, () => null);
  for (const { item, copies } of items) for (let i = 0; i < Math.max(0, Math.min(1000, Math.floor(copies))); i++) out.push(item);
  return out;
}

/** Divide em páginas pelo número de etiquetas por página. */
export function paginate<T>(slots: T[], perPage: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < slots.length; i += Math.max(1, perPage)) pages.push(slots.slice(i, i + Math.max(1, perPage)));
  return pages;
}

export const totalCopies = (items: { copies: number }[]) => items.reduce((s, it) => s + Math.max(0, Math.floor(it.copies)), 0);

/** Abaixo disto muitos leitores falham (e as impressoras térmicas de 203 dpi borram as barras). */
export const MIN_MODULE_MM = 0.19;
export const labelPadding = (g: Pick<LabelGeometry, 'w' | 'h'>) => Math.max(1, Math.min(2.5, Math.min(g.w, g.h) * 0.07));

/** Largura de cada barra fina (mm) quando o código ocupa a largura útil da etiqueta (com 10 módulos de margem de cada lado). */
export function moduleWidthMm(code: string, g: Pick<LabelGeometry, 'w' | 'h'>): number | null {
  const b = barcodeModules(code);
  if (!b) return null;
  return (g.w - 2 * labelPadding(g)) / (b.modules.length + 20);
}

/** O código cabe com barras largas o bastante para os leitores? */
export const barcodeReadable = (code: string, g: Pick<LabelGeometry, 'w' | 'h'>) => (moduleWidthMm(code, g) ?? 0) >= MIN_MODULE_MM;

export const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mm = (n: number) => `${Math.round(n * 100) / 100}mm`;

export type LabelTexts = { storeName: string; price: (amount: number) => string };

function labelInner(u: StockUnit, s: LabelSettings, g: LabelGeometry, tx: LabelTexts): string {
  const f = s.fields;
  const code = labelCode(u, s.codeSource);
  const lines: string[] = [];
  if (f.store && tx.storeName) lines.push(`<div class="st">${esc(tx.storeName)}</div>`);
  if (f.name) lines.push(`<div class="nm">${esc(u.name)}</div>`);
  const meta = [f.variant && u.variant ? esc(u.variant) : null, f.price ? `<b>${esc(tx.price(u.price))}</b>` : null].filter(Boolean);
  if (meta.length) lines.push(`<div class="mt">${meta.join(' · ')}</div>`);
  const bar = f.barcode ? `<div class="bc">${barcodeSvg(code, { showText: false, height: 40 })}</div>` : '';
  const text = f.code ? `<div class="ct">${esc(code)}</div>` : '';
  const tiny = g.h < 24 ? ' tiny' : '';
  return `<div class="txt${tiny}">${lines.join('')}</div>${bar}${text}`;
}

const SIZES = { sm: [7, 6, 5.5], md: [8.5, 7, 6.5], lg: [10, 8, 7.5] } as const;

/**
 * HTML com as páginas de etiquetas (folha inteira ou uma por página no rolo). skip = etiquetas já usadas no início
 * da primeira folha. Tudo o que vem da loja passa por esc(). preview = contorno tracejado da etiqueta no ecrã;
 * maxPages = só as primeiras páginas (a prévia mostra uma).
 */
export function productLabelsHtml(
  items: { unit: StockUnit; copies: number }[], s: LabelSettings, tx: LabelTexts, opts: { skip?: number; preview?: boolean; maxPages?: number } = {},
): string {
  const g = labelGeometry(s);
  const sh = g.sheet;
  const slots = labelSlots(items.map((i) => ({ item: i.unit, copies: i.copies })), sh ? opts.skip ?? 0 : 0);
  const pages = paginate(slots, labelsPerPage(g)).slice(0, opts.maxPages ?? Infinity);
  const paper = sh ? PAPER_MM[sh.paper] : { w: g.w, h: g.h };
  const pad = labelPadding(g);
  const [nm, mt, st] = SIZES[s.textSize];
  const align = s.align === 'left' ? 'left' : 'center';
  const outline = s.outline ? 'outline: 0.2mm solid #000; outline-offset: -0.2mm;' : opts.preview ? 'outline: 0.25mm dashed #bbb; outline-offset: -0.25mm;' : '';
  const css = `
    @page { size: ${sh ? (sh.paper === 'letter' ? 'letter' : 'A4') : `${mm(g.w)} ${mm(g.h)}`}; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #fff; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { position: relative; page-break-after: always; break-after: page; overflow: hidden; width: ${mm(paper.w)}; height: ${mm(paper.h)}; }
    .page:last-child { page-break-after: auto; break-after: auto; }
    .lb { position: absolute; width: ${mm(g.w)}; height: ${mm(g.h)}; padding: ${mm(pad * 0.75)} ${mm(pad)}; display: flex; flex-direction: column; overflow: hidden; text-align: ${align}; ${outline} }
    .txt { flex: 0 0 auto; line-height: 1.15; }
    .st { font-size: ${st}pt; text-transform: uppercase; letter-spacing: .4px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .nm { font-size: ${nm}pt; font-weight: 700; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .mt { font-size: ${mt}pt; margin-top: .3mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tiny .nm { -webkit-line-clamp: 1; }
    .bc { flex: 1 1 auto; min-height: 3mm; margin-top: .8mm; }
    .bc svg { width: 100%; height: 100%; display: block; }
    .ct { flex: 0 0 auto; font-family: "Courier New", monospace; font-size: ${st}pt; text-align: center; line-height: 1.1; white-space: nowrap; overflow: hidden; margin-top: .3mm; }
  `;
  const body = pages.map((page) => `<section class="page">${page.map((u, i) => {
    const col = sh ? i % sh.cols : 0;
    const row = sh ? Math.floor(i / sh.cols) : 0;
    const left = sh ? sh.left + col * (sh.w + sh.gapX) : 0;
    const top = sh ? sh.top + row * (sh.h + sh.gapY) : 0;
    return u ? `<div class="lb" style="left:${mm(left)};top:${mm(top)}">${labelInner(u, s, g, tx)}</div>` : '';
  }).join('')}</section>`).join('');
  return `<style>${css}</style>${body}`;
}

/**
 * Peça cujo estoque muda quando se lê esta unidade: a própria, se tem estoque próprio; senão a de que ela depende
 * (cor x tamanho sem estoque segue o tamanho; cor ou tamanho sem estoque seguem o produto).
 */
export function stockOwner(units: StockUnit[], u: StockUnit): StockUnit {
  if (u.stock != null || (!u.variationId && !u.sizeId)) return u;
  if (u.variationId && u.sizeId) {
    const size = units.find((x) => x.sizeId === u.sizeId && !x.variationId);
    if (size && size.stock != null) return size;
  }
  return units.find((x) => x.productId === u.productId && !x.variationId && !x.sizeId) ?? u;
}

/**
 * Peças que levam etiqueta própria: cada cor, tamanho ou combinação com estoque ou código próprio; o produto só
 * quando nenhuma parte dele tem.
 */
export function leafUnits(units: StockUnit[], productId?: string): StockUnit[] {
  const list = productId ? units.filter((u) => u.productId === productId) : units;
  const own = (u: StockUnit) => (u.variationId || u.sizeId) && (u.stock != null || !u.skuInherited || !!u.gtin);
  const withParts = new Set(list.filter(own).map((u) => u.productId));
  return list.filter((u) => (u.variationId || u.sizeId ? own(u) : !withParts.has(u.productId)));
}
