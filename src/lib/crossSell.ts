// =============================================================================================
// Venda cruzada (recurso cross_sell em Admin > Recursos da loja): regras puras.
//   - related_products.kind = 'cross_sell' ("Combina com", no carrinho) ou 'related' (página do produto)
//   - store_settings.cross_sell: quantos mostrar no carrinho, completar com destaques, carrinho lateral, relacionados
// Usado por Admin > Venda cruzada (AdminCrossSell), aba do produto (ProductLinksEditor), carrinho e página do produto.
// Teste: node --experimental-strip-types scripts/test-cross-sell.mjs
// =============================================================================================

export type LinkKind = 'cross_sell' | 'related';
export const LINK_KINDS: LinkKind[] = ['cross_sell', 'related'];

export type CrossSellSettings = {
  /** quantos produtos mostrar no carrinho (1 a 12) */
  cartLimit: number;
  /** sem ligações suficientes, completar com produtos em destaque */
  fillWithFeatured: boolean;
  /** mostrar também no carrinho lateral (até 3) */
  sideCart: boolean;
  /** os relacionados escolhidos aparecem primeiro em "Você também pode gostar" */
  relatedOnProduct: boolean;
};

export const DEFAULT_CROSS_SELL: CrossSellSettings = { cartLimit: 4, fillWithFeatured: true, sideCart: true, relatedOnProduct: true };
export const SIDE_CART_LIMIT = 3;

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

export function normalizeCrossSellSettings(raw: unknown): CrossSellSettings {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const n = Math.round(Number(r.cartLimit));
  return {
    cartLimit: Number.isFinite(n) ? Math.min(12, Math.max(1, n)) : DEFAULT_CROSS_SELL.cartLimit,
    fillWithFeatured: bool(r.fillWithFeatured, DEFAULT_CROSS_SELL.fillWithFeatured),
    sideCart: bool(r.sideCart, DEFAULT_CROSS_SELL.sideCart),
    relatedOnProduct: bool(r.relatedOnProduct, DEFAULT_CROSS_SELL.relatedOnProduct),
  };
}

export type LinkRow = { product_id: string; related_product_id: string; display_order: number | null; kind?: string };

/**
 * Produtos a sugerir para um carrinho: os ligados a mais itens do carrinho primeiro, depois a ordem escolhida no Admin
 * e a ordem dos itens no carrinho. Sem os que já estão no carrinho, sem repetidos.
 */
export function rankCrossSells(links: LinkRow[], cartIds: string[], limit: number): string[] {
  const inCart = new Set(cartIds);
  const pos = new Map(cartIds.map((id, i) => [id, i]));
  const score = new Map<string, { hits: number; order: number; cart: number }>();
  for (const l of links) {
    if (l.kind && l.kind !== 'cross_sell') continue;
    if (!inCart.has(l.product_id) || inCart.has(l.related_product_id)) continue;
    const cur = score.get(l.related_product_id);
    const order = Number(l.display_order ?? 0);
    const cart = pos.get(l.product_id) ?? 0;
    if (!cur) score.set(l.related_product_id, { hits: 1, order, cart });
    else score.set(l.related_product_id, { hits: cur.hits + 1, order: Math.min(cur.order, order), cart: Math.min(cur.cart, cart) });
  }
  return [...score.entries()]
    .sort((a, b) => b[1].hits - a[1].hits || a[1].order - b[1].order || a[1].cart - b[1].cart || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, limit))
    .map(([id]) => id);
}

/** Junta as escolhidas no Admin (primeiro, na ordem delas) com as automáticas, sem repetir e sem `exclude`. */
export function mergeSuggestions(manual: string[], auto: string[], limit: number, exclude: string[] = []): string[] {
  const seen = new Set(exclude);
  const out: string[] = [];
  for (const id of [...manual, ...auto]) {
    if (out.length >= limit) break;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Move um item da lista (setas de ordem no Admin). */
export function moveItem<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (index < 0 || index >= list.length || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

/** Contagem de ligações por produto e tipo (lista do Admin > Venda cruzada). */
export function linkCounts(links: LinkRow[]): Map<string, Record<LinkKind, number>> {
  const out = new Map<string, Record<LinkKind, number>>();
  for (const l of links) {
    const kind = (l.kind === 'related' ? 'related' : 'cross_sell') as LinkKind;
    const c = out.get(l.product_id) ?? { cross_sell: 0, related: 0 };
    c[kind] += 1;
    out.set(l.product_id, c);
  }
  return out;
}
