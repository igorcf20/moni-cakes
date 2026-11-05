// =====================================================================================
// Área do cliente: como a loja monta a conta (/dashboard) para quem compra (store_settings.account_page).
// Admin > Aparência da loja > Área do cliente (AdminAccountPage). Leitura pública, escrita só Admin.
// Tudo opcional e com padrão: sem a linha na base, a conta usa DEFAULT_ACCOUNT_PAGE.
// Teste: node --experimental-strip-types scripts/test-account-page.mjs
// =====================================================================================

/** Saudação no topo: faixa baixa com o nome em texto normal (compacta) ou o cartão alto com título grande. */
export type AccountHeader = 'compact' | 'large';
/** Números do Resumo (pedidos, favoritos, endereços): uma faixa só, cartões separados ou nada. */
export type AccountStats = 'strip' | 'cards' | 'off';
/** Aviso "Conta pronta para comprar": some quando está tudo preenchido (auto), sempre, ou nunca. */
export type AccountReadiness = 'auto' | 'always' | 'off';
/** Itens no cartão do pedido: lista com nome, quantidade e preço, ou só as fotos (como antes). */
export type AccountOrderItems = 'list' | 'thumbs';

export type AccountPageSettings = {
  header: AccountHeader;
  /** frase curta debaixo de cada item do menu da conta */
  nav_hints: boolean;
  /** número ao lado de Pedidos (em andamento), Favoritos e Endereços no menu */
  nav_counts: boolean;
  stats: AccountStats;
  readiness: AccountReadiness;
  /** blocos do Resumo */
  summary: {
    active_orders: boolean;
    buy_again: boolean;
    for_you: boolean;
    create: boolean;
  };
  order_items: AccountOrderItems;
  /** botão "Comprar tudo de novo" nos pedidos entregues */
  order_buy_again: boolean;
  /** ordenar e filtrar (em promoção) os favoritos */
  favorites_tools: boolean;
  /** cartão "Precisa de ajuda?" com atalhos para perguntas frequentes e contato */
  help_card: boolean;
};

export const DEFAULT_ACCOUNT_PAGE: AccountPageSettings = {
  header: 'compact',
  nav_hints: false,
  nav_counts: true,
  stats: 'strip',
  readiness: 'auto',
  summary: { active_orders: true, buy_again: true, for_you: true, create: true },
  order_items: 'list',
  order_buy_again: true,
  favorites_tools: true,
  help_card: true,
};

/** Modelo "Clássico": a conta como era antes desta versão. */
export const CLASSIC_ACCOUNT_PAGE: AccountPageSettings = {
  header: 'large',
  nav_hints: true,
  nav_counts: false,
  stats: 'cards',
  readiness: 'always',
  summary: { active_orders: true, buy_again: true, for_you: true, create: true },
  order_items: 'thumbs',
  order_buy_again: false,
  favorites_tools: false,
  help_card: false,
};

const pick = <V extends string>(v: unknown, allowed: readonly V[], d: V): V => (allowed.includes(v as V) ? (v as V) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Valor guardado (pode faltar ou ter lixo) -> regras completas. */
export function normalizeAccountPage(raw: unknown): AccountPageSettings {
  const r = obj(raw);
  const s = obj(r.summary);
  const d = DEFAULT_ACCOUNT_PAGE;
  return {
    header: pick(r.header, ['compact', 'large'] as const, d.header),
    nav_hints: bool(r.nav_hints, d.nav_hints),
    nav_counts: bool(r.nav_counts, d.nav_counts),
    stats: pick(r.stats, ['strip', 'cards', 'off'] as const, d.stats),
    readiness: pick(r.readiness, ['auto', 'always', 'off'] as const, d.readiness),
    summary: {
      active_orders: bool(s.active_orders, d.summary.active_orders),
      buy_again: bool(s.buy_again, d.summary.buy_again),
      for_you: bool(s.for_you, d.summary.for_you),
      create: bool(s.create, d.summary.create),
    },
    order_items: pick(r.order_items, ['list', 'thumbs'] as const, d.order_items),
    order_buy_again: bool(r.order_buy_again, d.order_buy_again),
    favorites_tools: bool(r.favorites_tools, d.favorites_tools),
    help_card: bool(r.help_card, d.help_card),
  };
}

export const sameAccountPage = (a: AccountPageSettings, b: AccountPageSettings) =>
  JSON.stringify(normalizeAccountPage(a)) === JSON.stringify(normalizeAccountPage(b));

/** Mostra o aviso "Conta pronta para comprar"? (auto = só enquanto falta algo) */
export const showReadiness = (mode: AccountReadiness, completeness: number) =>
  mode === 'always' || (mode === 'auto' && completeness < 100);

type Line = { product_id: string | null; quantity: number; design_data?: Record<string, unknown> | null };

/**
 * Linhas de um pedido que voltam ao carrinho com "Comprar tudo de novo": só produtos do catálogo sem
 * personalização, aluguel, assinatura, orçamento ou pré-venda (esses pedem escolhas na página do produto).
 * Linhas do mesmo produto somam a quantidade.
 */
export function rebuyLines(items: Line[]): { productId: string; quantity: number }[] {
  const out = new Map<string, number>();
  for (const it of items) {
    const dd = obj(it.design_data);
    if (!it.product_id || dd.customization || dd.rental || dd.subscription || dd.quote || dd.preorder) continue;
    const q = Math.max(1, Math.floor(Number(it.quantity) || 1));
    out.set(it.product_id, (out.get(it.product_id) ?? 0) + q);
  }
  return [...out].map(([productId, quantity]) => ({ productId, quantity }));
}

export type FavoriteSort = 'recent' | 'price_asc' | 'price_desc';

/** Ordena (e filtra os em promoção) sem mudar a lista original; "recent" mantém a ordem recebida. */
export function sortFavorites<T extends { amount?: number | null; discountPct?: number }>(cards: T[], sort: FavoriteSort, onlySale = false): T[] {
  const list = onlySale ? cards.filter((c) => (c.discountPct ?? 0) > 0) : [...cards];
  // Sem preço conhecido vai para o fim nas duas ordens.
  const v = (c: T, dir: 1 | -1) => (c.amount == null ? Infinity : dir * c.amount);
  if (sort === 'price_asc') list.sort((a, b) => v(a, 1) - v(b, 1));
  if (sort === 'price_desc') list.sort((a, b) => v(a, -1) - v(b, -1));
  return list;
}
