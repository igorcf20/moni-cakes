// =============================================================================================
// Feed de produtos (recurso product_feed em Admin > Recursos da loja): regras puras do arquivo XML que o Google
// Merchant Center (Google Shopping) lê, também aceito pelo catálogo da Meta (Facebook e Instagram), TikTok e Pinterest.
// Um feed por país: moeda, imposto e link seguem o país, como o site mostra (App.tsx CurrencyLoader, utils/pricing.ts).
//   - preço = preço à unidade (escalão de 1 unidade, senão o preço) + acréscimo da cor e do tamanho;
//     promoção ativa = sale_price com a data de fim; países com IVA somam a taxa do país;
//     moeda do país quando a loja tem taxa de câmbio para ela (com a margem de câmbio), senão a moeda base.
//   - uma linha por cor e tamanho (item_group_id = produto), com código, código de barras, foto e estoque próprios.
//   - regras em store_settings.product_feed (normalizeFeedSettings).
// Cópia IGUAL em supabase/functions/_shared/productFeed.ts (função product-feed); o teste compara as duas.
// Sem imports para correr no navegador, no Deno e no node. Teste: node --experimental-strip-types scripts/test-product-feed.mjs
// =============================================================================================

/* ---------- Regras (store_settings.product_feed) ---------- */

export type FeedCondition = 'new' | 'refurbished' | 'used';
export const FEED_CONDITIONS: FeedCondition[] = ['new', 'refurbished', 'used'];

export type FeedSettings = {
  /** países com feed (vazio = todos os países ativos da loja) */
  countries: string[];
  /** uma linha por cor e tamanho (senão uma por produto) */
  variants: boolean;
  /** produtos esgotados entram como "out_of_stock" (senão ficam de fora) */
  includeOutOfStock: boolean;
  /** produto sem marca usa o nome da loja como marca */
  brandFallback: boolean;
  condition: FeedCondition;
  /** categoria do Google para todos os produtos (número ou caminho, ex.: 696 ou "Casa e jardim > Decoração") */
  defaultGoogleCategory: string;
  /** categoria do Google por categoria da loja (chave = categoryKey do produto) */
  categoryMap: Record<string, string>;
  /** categorias da loja que não entram (chave = categoryKey) */
  excludedCategories: string[];
  /** produtos que não entram (id) */
  excludedProducts: string[];
};

export const DEFAULT_FEED_SETTINGS: FeedSettings = {
  countries: [],
  variants: true,
  includeOutOfStock: true,
  brandFallback: true,
  condition: 'new',
  defaultGoogleCategory: '',
  categoryMap: {},
  excludedCategories: [],
  excludedProducts: [],
};

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strList = (v: unknown, max = 5000) =>
  Array.isArray(v) ? [...new Set(v.map((x) => str(x, 200)).filter(Boolean))].slice(0, max) : [];

export function normalizeFeedSettings(raw: unknown): FeedSettings {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const map: Record<string, string> = {};
  if (o.categoryMap && typeof o.categoryMap === 'object' && !Array.isArray(o.categoryMap)) {
    for (const [k, v] of Object.entries(o.categoryMap as Record<string, unknown>)) {
      const key = categoryKey(k);
      const val = str(v, 250);
      if (key && val) map[key] = val;
    }
  }
  const bool = (k: keyof FeedSettings) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : (DEFAULT_FEED_SETTINGS[k] as boolean));
  return {
    countries: [...new Set(strList(o.countries, 300).map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))],
    variants: bool('variants'),
    includeOutOfStock: bool('includeOutOfStock'),
    brandFallback: bool('brandFallback'),
    condition: FEED_CONDITIONS.includes(o.condition as FeedCondition) ? (o.condition as FeedCondition) : 'new',
    defaultGoogleCategory: str(o.defaultGoogleCategory, 250),
    categoryMap: map,
    excludedCategories: [...new Set(strList(o.excludedCategories, 500).map(categoryKey).filter(Boolean))],
    excludedProducts: strList(o.excludedProducts),
  };
}

/** Chave estável de uma categoria da loja (products.category ou categories.slug): sem acentos, minúsculas, hífens. */
export function categoryKey(v: unknown): string {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
}

/** O país tem feed? (lista vazia = todos os ativos) */
export const feedCountryOn = (s: FeedSettings, code: string) => !s.countries.length || s.countries.includes(code.toUpperCase());

/* ---------- Dados de entrada ---------- */

export type FeedProduct = {
  id: string; slug?: string | null; name: string; description?: string | null; short_description?: string | null;
  price: number | string; promo_active?: boolean | null; promo_type?: string | null; promo_value?: number | string | null;
  promo_starts_at?: string | null; promo_ends_at?: string | null;
  stock_quantity?: number | null; customizable?: boolean | null; image?: string | null; images?: string[] | null;
  category?: string | null; brand_id?: string | null; sku?: string | null; gtin?: string | null; mpn?: string | null; weight?: number | string | null;
};
export type FeedColor = { id: string; product_id: string; name: string; image_url?: string | null; price_modifier?: number | string | null; sku?: string | null; gtin?: string | null; stock_quantity?: number | null };
export type FeedSize = { id: string; product_id: string; size_label: string; price_modifier?: number | string | null; sku?: string | null; gtin?: string | null; stock_quantity?: number | null };
export type FeedCombo = { variation_id: string; product_size_id: string; is_available?: boolean | null; stock_quantity?: number | null; price_modifier?: number | string | null; sku?: string | null; gtin?: string | null; image_url?: string | null };
export type FeedTier = { product_id: string; min_meters: number | string; price_per_meter: number | string };

export type FeedData = {
  products: FeedProduct[];
  colors?: FeedColor[];
  sizes?: FeedSize[];
  combos?: FeedCombo[];
  tiers?: FeedTier[];
};

export type FeedCountry = { code: string; currency: string; taxMode: 'inclusive' | 'vat'; taxRate: number };
/** store_settings.currency_settings: moeda base, taxas (1 base = x moeda) e margem de câmbio em %. */
export type FeedMoney = { base: string; rates: Record<string, number>; markup: number };

export type FeedContext = {
  /** endereço público da loja, sem barra no fim */
  siteUrl: string;
  storeName: string;
  country: FeedCountry;
  money: FeedMoney;
  settings: FeedSettings;
  /** estoque próprio da cor (recurso variants ligado) */
  colorStock: boolean;
  /** marcas ativas: id -> nome (recurso brands ligado; vazio = sem marcas) */
  brands: Record<string, string>;
  /** nome da categoria da loja por categoryKey (slug e nome) */
  categoryNames: Record<string, string>;
  now?: Date;
};

export function normalizeMoney(raw: unknown): FeedMoney {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const base = /^[A-Z]{3}$/.test(String(o.default ?? '')) ? String(o.default) : 'BRL';
  const rates: Record<string, number> = {};
  if (o.rates && typeof o.rates === 'object') {
    for (const [k, v] of Object.entries(o.rates as Record<string, unknown>)) {
      const n = Number(v);
      if (/^[A-Z]{3}$/.test(k) && Number.isFinite(n) && n > 0) rates[k] = n;
    }
  }
  const markup = Number(o.markup);
  return { base, rates, markup: Number.isFinite(markup) && markup > 0 ? markup : 0 };
}

/* ---------- Preço ---------- */

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Moeda do feed do país e o fator sobre o preço base (moeda do país só com taxa de câmbio, como o site). */
export function feedCurrency(country: FeedCountry, money: FeedMoney): { currency: string; factor: number; converted: boolean } {
  if (country.currency === money.base) return { currency: money.base, factor: 1, converted: false };
  const rate = money.rates[country.currency];
  if (!rate) return { currency: money.base, factor: 1, converted: false };
  return { currency: country.currency, factor: rate * (1 + money.markup / 100), converted: true };
}

export const currencyDigits = (currency: string) => {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2; } catch { return 2; }
};

/** Promoção do produto agora (mesma regra de utils/promo.ts e _shared/pricing.ts). */
export function feedPromo(p: FeedProduct, now = new Date()): { ratio: number; startsAt: Date | null; endsAt: Date | null } | null {
  if (!p.promo_active) return null;
  const raw = num(p.price);
  const value = num(p.promo_value);
  if (raw <= 0 || value <= 0) return null;
  const startsAt = p.promo_starts_at ? new Date(p.promo_starts_at) : null;
  const endsAt = p.promo_ends_at ? new Date(p.promo_ends_at) : null;
  if ((startsAt && startsAt > now) || (endsAt && endsAt <= now)) return null;
  const discount = String(p.promo_type ?? '').toLowerCase() === 'fixed' ? Math.min(raw, value) : Math.min(raw, (raw * value) / 100);
  return { ratio: Math.max(0, raw - discount) / raw, startsAt, endsAt };
}

/** Preço de 1 unidade sem acréscimos: o escalão que vale para 1 unidade, senão o preço do produto (em moeda base, líquido). */
export function unitBase(p: FeedProduct, tiers: FeedTier[]): number {
  const tier = tiers
    .filter((t) => String(t.product_id) === String(p.id) && num(t.min_meters) <= 1 + 1e-9)
    .sort((a, b) => num(b.min_meters) - num(a.min_meters))[0];
  return tier ? num(tier.price_per_meter) : num(p.price);
}

/** Valor final no feed: imposto do país (IVA) e moeda, arredondado às casas da moeda. */
export function feedAmount(net: number, ctx: Pick<FeedContext, 'country' | 'money'>): { amount: number; currency: string } {
  const { currency, factor } = feedCurrency(ctx.country, ctx.money);
  const tax = ctx.country.taxMode === 'vat' ? Math.max(0, num(ctx.country.taxRate)) : 0;
  const d = currencyDigits(currency);
  const amount = Math.round(Math.max(0, net) * (1 + tax / 100) * factor * 10 ** d) / 10 ** d;
  return { amount, currency };
}

export const formatFeedPrice = (amount: number, currency: string) => `${amount.toFixed(currencyDigits(currency))} ${currency}`;

/* ---------- Variantes ---------- */

export type FeedVariant = {
  key: string;
  variationId: string | null;
  sizeId: string | null;
  colorName: string | null;
  sizeLabel: string | null;
  sku: string | null;
  gtin: string | null;
  /** null = sem controle de estoque (personalizável ou estoque vazio) */
  stock: number | null;
  image: string | null;
  modifier: number;
};

const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const int = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.floor(Number(v))));

/**
 * Combinações vendáveis do produto, como a página do produto (useProductPage): cor x tamanho pela matriz (sem linha =
 * estoque e acréscimo do tamanho; acréscimo da matriz substitui o do tamanho quando não é 0; indisponível fica de fora),
 * só cores (estoque próprio da cor com o recurso variants, senão o do produto), só tamanhos, ou o próprio produto.
 */
export function feedVariants(p: FeedProduct, colors: FeedColor[], sizes: FeedSize[], combos: FeedCombo[], colorStock: boolean): FeedVariant[] {
  const controlled = !p.customizable;
  const productStock = controlled ? int(p.stock_quantity) : null;
  const stockOf = (v: number | null) => (controlled ? v : null);
  const base = { variationId: null, sizeId: null, colorName: null, sizeLabel: null, image: null };
  if (colors.length && sizes.length) {
    const map = new Map(combos.map((c) => [`${c.variation_id}:${c.product_size_id}`, c]));
    return colors.flatMap((c) => sizes.flatMap((s) => {
      const m = map.get(`${c.id}:${s.id}`);
      if (m && m.is_available === false) return [];
      const sizeMod = m && num(m.price_modifier) !== 0 ? num(m.price_modifier) : num(s.price_modifier);
      return [{
        ...base, key: `${c.id}:${s.id}`, variationId: c.id, sizeId: s.id, colorName: c.name, sizeLabel: s.size_label,
        sku: clean(m?.sku), gtin: clean(m?.gtin),
        stock: stockOf(m ? int(m.stock_quantity) ?? 0 : int(s.stock_quantity) ?? 0),
        image: clean(m?.image_url) ?? clean(c.image_url),
        modifier: num(c.price_modifier) + sizeMod,
      }];
    }));
  }
  if (colors.length) {
    return colors.map((c) => ({
      ...base, key: `v:${c.id}`, variationId: c.id, colorName: c.name, sku: clean(c.sku), gtin: clean(c.gtin),
      stock: stockOf(colorStock && c.stock_quantity != null ? int(c.stock_quantity) : productStock),
      image: clean(c.image_url), modifier: num(c.price_modifier),
    }));
  }
  if (sizes.length) {
    return sizes.map((s) => ({
      ...base, key: `s:${s.id}`, sizeId: s.id, sizeLabel: s.size_label, sku: clean(s.sku), gtin: clean(s.gtin),
      stock: stockOf(int(s.stock_quantity) ?? 0), modifier: num(s.price_modifier),
    }));
  }
  return [{ ...base, key: `p:${p.id}`, sku: clean(p.sku), gtin: clean(p.gtin), stock: productStock, modifier: 0 }];
}

/* ---------- Problemas por produto ---------- */

export type FeedIssue = 'no_image' | 'no_price' | 'no_description' | 'no_brand' | 'no_gtin' | 'title_long';
/** Problemas que tiram o produto do feed (o Google recusaria). Os outros são avisos. */
export const BLOCKING_ISSUES: FeedIssue[] = ['no_image', 'no_price'];

export function stripHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function productIssues(p: FeedProduct, variants: FeedVariant[], ctx: Pick<FeedContext, 'brands' | 'settings'>): FeedIssue[] {
  const out: FeedIssue[] = [];
  if (!clean(p.image) && !(p.images ?? []).some((x) => clean(x)) && !variants.some((v) => v.image)) out.push('no_image');
  if (num(p.price) <= 0) out.push('no_price');
  if (!stripHtml(p.description) && !stripHtml(p.short_description)) out.push('no_description');
  if (!(p.brand_id && ctx.brands[p.brand_id]) && !ctx.settings.brandFallback) out.push('no_brand');
  if (!variants.some((v) => v.gtin)) out.push('no_gtin');
  if (String(p.name ?? '').trim().length > 150) out.push('title_long');
  return out;
}

/* ---------- Linhas do feed ---------- */

export type FeedItem = {
  id: string;
  item_group_id?: string;
  title: string;
  description: string;
  link: string;
  image_link: string;
  additional_image_link: string[];
  availability: 'in_stock' | 'out_of_stock';
  price: string;
  sale_price?: string;
  sale_price_effective_date?: string;
  brand?: string;
  gtin?: string;
  mpn?: string;
  identifier_exists?: 'no';
  condition: FeedCondition;
  product_type?: string;
  google_product_category?: string;
  color?: string;
  size?: string;
  shipping_weight?: string;
  /** só para o Admin (não vai para o XML) */
  productId: string;
};

export type FeedSkip = { productId: string; name: string; reason: 'excluded' | 'category' | 'out_of_stock' | FeedIssue };

/** Endereço absoluto de uma foto ou página da loja. */
export function absoluteUrl(siteUrl: string, v: string | null | undefined): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return `${siteUrl.replace(/\/+$/, '')}/${s.replace(/^\/+/, '')}`;
}

/** Código estável e curto (FNV-1a 32 bits) para as linhas sem SKU. */
export function shortHash(v: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < v.length; i += 1) { h ^= v.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** id da linha: o SKU; senão o id do produto (+ código curto da variante). Até 50 caracteres (limite do Google). */
export function feedItemId(productId: string, v: FeedVariant, single: boolean): string {
  if (v.sku) return v.sku.slice(0, 50);
  const base = productId.length <= 40 ? productId : shortHash(productId);
  return (single ? base : `${base}-${shortHash(v.key)}`).slice(0, 50);
}

const trimTo = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 3).trimEnd()}...`);

/** Linhas do feed de um país e o que ficou de fora (com o motivo). */
export function buildFeedItems(data: FeedData, ctx: FeedContext): { items: FeedItem[]; skipped: FeedSkip[] } {
  const now = ctx.now ?? new Date();
  const s = ctx.settings;
  const site = ctx.siteUrl.replace(/\/+$/, '');
  const group = <T extends { product_id: string }>(rows: T[] | undefined) => {
    const m = new Map<string, T[]>();
    for (const r of rows ?? []) { const k = String(r.product_id); m.set(k, [...(m.get(k) ?? []), r]); }
    return m;
  };
  const colorsBy = group(data.colors);
  const sizesBy = group(data.sizes);
  const colorIds = new Set((data.colors ?? []).map((c) => c.id));
  const combos = (data.combos ?? []).filter((c) => colorIds.has(c.variation_id));
  const tiers = data.tiers ?? [];
  const excluded = new Set(s.excludedProducts);
  const excludedCats = new Set(s.excludedCategories);

  const items: FeedItem[] = [];
  const skipped: FeedSkip[] = [];
  for (const p of data.products) {
    const pid = String(p.id);
    const name = String(p.name ?? '').trim();
    if (excluded.has(pid)) { skipped.push({ productId: pid, name, reason: 'excluded' }); continue; }
    const cat = categoryKey(p.category);
    if (cat && excludedCats.has(cat)) { skipped.push({ productId: pid, name, reason: 'category' }); continue; }

    const colors = colorsBy.get(pid) ?? [];
    const sizes = sizesBy.get(pid) ?? [];
    const all = feedVariants(p, colors, sizes, combos.filter((c) => colors.some((x) => x.id === c.variation_id)), ctx.colorStock);
    const issues = productIssues(p, all, ctx);
    const blocking = issues.find((i) => BLOCKING_ISSUES.includes(i));
    if (blocking) { skipped.push({ productId: pid, name, reason: blocking }); continue; }

    // Sem linha por variante: uma linha do produto, em estoque se alguma variante estiver.
    const variants: FeedVariant[] = s.variants || all.length <= 1 ? all : [{
      key: `p:${pid}`, variationId: null, sizeId: null, colorName: null, sizeLabel: null, sku: clean(p.sku), gtin: clean(p.gtin),
      stock: all.some((v) => v.stock == null) ? null : Math.max(0, ...all.map((v) => v.stock ?? 0)), image: null,
      modifier: Math.min(...all.map((v) => v.modifier)),
    }];
    const single = variants.length === 1 && variants[0].key.startsWith('p:');

    const promo = feedPromo(p, now);
    const base = unitBase(p, tiers);
    const description = trimTo(stripHtml(p.description) || stripHtml(p.short_description) || name, 5000);
    const brand = (p.brand_id && ctx.brands[p.brand_id]) || (s.brandFallback ? ctx.storeName : '');
    const productType = cat ? ctx.categoryNames[cat] ?? String(p.category ?? '').trim() : '';
    const googleCategory = (cat && s.categoryMap[cat]) || s.defaultGoogleCategory;
    const photos = [clean(p.image), ...(p.images ?? []).map(clean)].filter((x): x is string => !!x);
    const weight = num(p.weight);
    let kept = 0;

    for (const v of variants) {
      const inStock = v.stock == null || v.stock > 0;
      if (!inStock && !s.includeOutOfStock) continue;
      const regular = feedAmount(base + v.modifier, ctx);
      const sale = promo ? feedAmount(base * promo.ratio + v.modifier, ctx) : null;
      const imgs = [...new Set([v.image, ...photos].filter((x): x is string => !!x).map((x) => absoluteUrl(site, x)))];
      const params = new URLSearchParams({ pais: ctx.country.code });
      if (v.variationId) params.set('cor', v.variationId);
      if (v.sizeId) params.set('tamanho', v.sizeId);
      const label = [v.colorName, v.sizeLabel].filter(Boolean).join(' / ');
      const item: FeedItem = {
        id: feedItemId(pid, v, single),
        title: trimTo(label ? `${name} (${label})` : name, 150),
        description,
        link: `${site}/produto/${encodeURIComponent(clean(p.slug) ?? pid)}?${params.toString()}`,
        image_link: imgs[0],
        additional_image_link: imgs.slice(1, 11),
        availability: inStock ? 'in_stock' : 'out_of_stock',
        price: formatFeedPrice(regular.amount, regular.currency),
        condition: s.condition,
        productId: pid,
      };
      if (!single) item.item_group_id = (pid.length <= 50 ? pid : shortHash(pid));
      if (sale && sale.amount < regular.amount) {
        item.sale_price = formatFeedPrice(sale.amount, sale.currency);
        if (promo?.endsAt) item.sale_price_effective_date = `${(promo.startsAt ?? now).toISOString()}/${promo.endsAt.toISOString()}`;
      }
      if (brand) item.brand = brand.slice(0, 70);
      // Código da marca (products.mpn) vai como mpn mesmo com GTIN; sem ele, o SKU faz de mpn quando há marca.
      const mpn = clean(p.mpn) ?? (brand ? v.sku : null);
      if (v.gtin) item.gtin = v.gtin;
      if (mpn && brand) item.mpn = mpn.slice(0, 70);
      if (!v.gtin && !(mpn && brand)) item.identifier_exists = 'no';
      if (productType) item.product_type = productType.slice(0, 750);
      if (googleCategory) item.google_product_category = googleCategory;
      if (v.colorName) item.color = v.colorName.slice(0, 100);
      if (v.sizeLabel) item.size = v.sizeLabel.slice(0, 100);
      if (weight > 0) item.shipping_weight = `${Math.round(weight * 1000) / 1000} kg`;
      items.push(item);
      kept += 1;
    }
    if (!kept) skipped.push({ productId: pid, name, reason: 'out_of_stock' });
  }
  return { items, skipped };
}

/* ---------- XML (RSS 2.0 com o espaço de nomes g: do Google) ---------- */

export function xmlEscape(v: string): string {
  // Tira caracteres de controle que o XML não aceita (fica tab, quebra de linha e retorno).
  const visible = Array.from(v).filter((ch) => { const c = ch.charCodeAt(0); return c >= 32 || c === 9 || c === 10 || c === 13; }).join('');
  return visible
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const FIELD_ORDER: (keyof FeedItem)[] = [
  'id', 'item_group_id', 'title', 'description', 'link', 'image_link', 'additional_image_link', 'availability', 'price',
  'sale_price', 'sale_price_effective_date', 'brand', 'gtin', 'mpn', 'identifier_exists', 'condition', 'product_type',
  'google_product_category', 'color', 'size', 'shipping_weight',
];

export function feedXml(items: FeedItem[], channel: { title: string; link: string; description: string }): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">', '<channel>',
    `<title>${xmlEscape(channel.title)}</title>`, `<link>${xmlEscape(channel.link)}</link>`, `<description>${xmlEscape(channel.description)}</description>`];
  for (const it of items) {
    lines.push('<item>');
    for (const k of FIELD_ORDER) {
      const v = it[k];
      if (v == null || v === '') continue;
      const tag = k === 'title' || k === 'description' || k === 'link' ? k : `g:${k}`;
      for (const one of Array.isArray(v) ? v : [v]) lines.push(`  <${tag}>${xmlEscape(String(one))}</${tag}>`);
    }
    lines.push('</item>');
  }
  lines.push('</channel>', '</rss>', '');
  return lines.join('\n');
}
