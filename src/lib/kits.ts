// =====================================================================================
// Kits no site (recurso kits): textos por idioma, período de validade, preços para mostrar, disponibilidade das peças
// e o que falta para completar um kit no carrinho. Funções puras (teste: scripts/test-kits.mjs).
// O desconto em si segue src/lib/kitPricing.ts (carrinho) e _shared/pricing.ts (servidor), que decidem o valor final.
// Colunas: kits.name / description / long_description / highlights = idioma padrão; *_i18n = {"en": "...", ...}.
// =====================================================================================
import { kitPct, type KitTag } from './kitPricing.ts';

export type KitRow = {
  id: string;
  slug?: string | null;
  name: string;
  description?: string | null;
  image_url?: string | null;
  discount_type: string;
  discount_value: number;
  is_active?: boolean;
  display_order?: number;
  name_i18n?: Record<string, string> | null;
  description_i18n?: Record<string, string> | null;
  long_description?: string | null;
  long_description_i18n?: Record<string, string> | null;
  highlights?: string | null;
  highlights_i18n?: Record<string, string> | null;
  gallery?: unknown;
  show_on_home?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
};

export type KitProduct = {
  id: string;
  name: string;
  slug?: string | null;
  price: number | string;
  image?: string | null;
  is_active?: boolean | null;
  stock_quantity?: number | null;
  [key: string]: unknown;
};

export type KitItemRow = { kit_id: string; product_id: string; quantity: number; note?: string | null; display_order?: number | null };

type TextField = 'name' | 'description' | 'long_description' | 'highlights';

/** Texto do kit no idioma pedido; vazio volta ao idioma padrão (coluna simples). */
export function kitText(kit: KitRow, field: TextField, locale: string): string {
  const map = kit[`${field}_i18n` as const] as Record<string, string> | null | undefined;
  const own = map && typeof map[locale] === 'string' ? map[locale].trim() : '';
  if (own) return own;
  return String(kit[field] ?? '').trim();
}

/** Destaques: um por linha, sem linhas vazias nem marcadores escritos à mão. */
export function kitHighlights(kit: KitRow, locale: string): string[] {
  return kitText(kit, 'highlights', locale)
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

/** Fotos do kit: a principal e a galeria, sem repetidas. */
export function kitPhotos(kit: KitRow): string[] {
  const list = [kit.image_url, ...(Array.isArray(kit.gallery) ? kit.gallery : [])]
    .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
    .map((u) => u.trim());
  return [...new Set(list)];
}

/** Ativo e dentro do período (a política da base e o servidor fazem a mesma conta). */
export function kitIsLive(kit: Pick<KitRow, 'is_active' | 'starts_at' | 'ends_at'>, now = Date.now()): boolean {
  if (kit.is_active === false) return false;
  if (kit.starts_at && Date.parse(kit.starts_at) > now) return false;
  if (kit.ends_at && Date.parse(kit.ends_at) <= now) return false;
  return true;
}

/** Endereço público do kit. */
export const kitHref = (kit: Pick<KitRow, 'id' | 'slug'>) => `/kit/${kit.slug || kit.id}`;

/** Peça fora de venda ou sem estoque (o kit não fecha no checkout). */
export function pieceSoldOut(p: KitProduct | null | undefined): boolean {
  if (!p) return true;
  if (p.is_active === false) return true;
  return p.stock_quantity != null && Number(p.stock_quantity) <= 0;
}

/**
 * Preços do kit para mostrar (líquidos, sem imposto): soma das peças (preço unitário já com promoção e acréscimos da
 * escolha), desconto do kit e total. O percentual sai do preço de tabela (products.price), como no servidor.
 */
export function kitPrices(kit: Pick<KitRow, 'discount_type' | 'discount_value'>, parts: { list: number; unit: number; quantity: number }[]) {
  const listTotal = parts.reduce((s, p) => s + (Number(p.list) || 0) * (Number(p.quantity) || 0), 0);
  const pct = kitPct(kit.discount_type, Number(kit.discount_value) || 0, listTotal);
  const original = parts.reduce((s, p) => s + (Number(p.unit) || 0) * (Number(p.quantity) || 0), 0);
  const discount = original * pct;
  return { pct, original, discount, final: Math.max(0, original - discount) };
}

/** Peças que faltam para completar o kit marcado nas linhas do carrinho (quantidade que falta por produto). */
export function kitMissing(lines: { product_id: string; quantity: number; kit?: KitTag | null }[], tag: KitTag): { product_id: string; quantity: number }[] {
  return tag.items
    .map((item) => {
      const have = lines
        .filter((l) => l.kit?.id === tag.id && String(l.product_id) === String(item.product_id))
        .reduce((s, l) => s + (Number(l.quantity) || 0), 0);
      return { product_id: String(item.product_id), quantity: Math.max(0, item.quantity - have) };
    })
    .filter((m) => m.quantity > 0);
}

/** Kits que contêm algum produto do carrinho sem a marca do kit (sugestão "leve o kit"). */
export function kitsForLooseLines<T extends { kit_id: string; product_id: string }>(
  lines: { product_id: string; kit?: KitTag | null }[],
  items: T[],
): string[] {
  const loose = new Set(lines.filter((l) => !l.kit?.id).map((l) => String(l.product_id)));
  const tagged = new Set(lines.map((l) => l.kit?.id).filter(Boolean) as string[]);
  return [...new Set(items.filter((i) => loose.has(String(i.product_id)) && !tagged.has(i.kit_id)).map((i) => i.kit_id))];
}

/* ---------- Onde oferecer os kits (store_settings.kits, Admin > Catálogo > Kits > Onde oferecer) ---------- */

export type KitSettings = {
  /** página do produto: "Este produto faz parte de um kit" */
  productPage: boolean;
  /** quantos kits mostrar na página do produto (1 a 3) */
  productPageLimit: number;
  /** carrinho: "Complete o kit" quando falta uma peça de um kit já escolhido */
  cartComplete: boolean;
  /** carrinho: "Leve o kit" quando um produto avulso faz parte de um kit */
  cartLoose: boolean;
  /** carrinho lateral (a gaveta que abre ao adicionar) com os mesmos avisos */
  sideCart: boolean;
  /** checkout: os mesmos avisos no resumo do pedido */
  checkout: boolean;
  /** link "Kits com desconto" no rodapé */
  footerLink: boolean;
};

export const DEFAULT_KIT_SETTINGS: KitSettings = {
  productPage: true, productPageLimit: 2, cartComplete: true, cartLoose: true, sideCart: false, checkout: false, footerLink: true,
};

export function normalizeKitSettings(raw: unknown): KitSettings {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const b = (k: keyof KitSettings) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : (DEFAULT_KIT_SETTINGS[k] as boolean));
  const n = Math.round(Number(r.productPageLimit));
  return {
    productPage: b('productPage'),
    productPageLimit: Number.isFinite(n) ? Math.min(3, Math.max(1, n)) : DEFAULT_KIT_SETTINGS.productPageLimit,
    cartComplete: b('cartComplete'),
    cartLoose: b('cartLoose'),
    sideCart: b('sideCart'),
    checkout: b('checkout'),
    footerLink: b('footerLink'),
  };
}
