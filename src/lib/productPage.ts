// =====================================================================================
// Página do produto: como a loja monta a área de compra e a parte de baixo (store_settings.product_page).
// Admin > Aparência da loja > Página do produto (AdminProductPage). Leitura pública, escrita só Admin.
// Tudo opcional e com padrão: sem a linha na base, a página usa DEFAULT_PRODUCT_PAGE.
// Teste: node --experimental-strip-types scripts/test-product-page.mjs
// =====================================================================================

/** Favoritos e Comparar: lado a lado e menores (compacto) ou um botão largo por linha (completo). */
export type ProductPageActions = 'compact' | 'full';
/** Garantias da compra: cartão com título e explicação por linha, ou lista curta (discreta). */
export type ProductPageTrustStyle = 'card' | 'list';
/** Descrição, ficha técnica e avaliações: em seções uma abaixo da outra, ou em abas. */
export type ProductPageDetails = 'sections' | 'tabs';

export type ProductPageSettings = {
  actions: ProductPageActions;
  /** quantidade ao lado do botão Adicionar ao carrinho (senão por cima, como antes) */
  quantity_inline: boolean;
  /** linha de disponibilidade: Em estoque, Últimas unidades, Feito sob encomenda */
  availability: boolean;
  /** ficha rápida (até 4 dados) abaixo do resumo */
  quick_specs: boolean;
  /** botão Compartilhar no alto da área de compra */
  share: boolean;
  trust: {
    on: boolean;
    style: ProductPageTrustStyle;
    /** linha da devolução (só com o recurso Devoluções ligado e prazo maior que zero) */
    returns: boolean;
    /** ícones dos meios de pagamento ativos no país */
    payments: boolean;
  };
  details: ProductPageDetails;
  /** barra de compra fixa no computador quando o botão principal sai da tela */
  desktop_bar: boolean;
  /** foto do produto na barra de compra do celular */
  mobile_bar_photo: boolean;
};

export const DEFAULT_PRODUCT_PAGE: ProductPageSettings = {
  actions: 'compact',
  quantity_inline: true,
  availability: true,
  quick_specs: true,
  share: true,
  trust: { on: true, style: 'card', returns: true, payments: true },
  details: 'sections',
  desktop_bar: true,
  mobile_bar_photo: true,
};

/** Modelo "Clássico": a página como era antes desta versão (abas, botões largos, lista curta, sem barras extra). */
export const CLASSIC_PRODUCT_PAGE: ProductPageSettings = {
  actions: 'full',
  quantity_inline: false,
  availability: false,
  quick_specs: true,
  share: false,
  trust: { on: true, style: 'list', returns: false, payments: false },
  details: 'tabs',
  desktop_bar: false,
  mobile_bar_photo: false,
};

const pick = <V extends string>(v: unknown, allowed: readonly V[], d: V): V => (allowed.includes(v as V) ? (v as V) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Valor guardado (pode faltar ou ter lixo) -> regras completas. */
export function normalizeProductPage(raw: unknown): ProductPageSettings {
  const r = obj(raw);
  const t = obj(r.trust);
  const d = DEFAULT_PRODUCT_PAGE;
  return {
    actions: pick(r.actions, ['compact', 'full'] as const, d.actions),
    quantity_inline: bool(r.quantity_inline, d.quantity_inline),
    availability: bool(r.availability, d.availability),
    quick_specs: bool(r.quick_specs, d.quick_specs),
    share: bool(r.share, d.share),
    trust: {
      on: bool(t.on, d.trust.on),
      style: pick(t.style, ['card', 'list'] as const, d.trust.style),
      returns: bool(t.returns, d.trust.returns),
      payments: bool(t.payments, d.trust.payments),
    },
    details: pick(r.details, ['sections', 'tabs'] as const, d.details),
    desktop_bar: bool(r.desktop_bar, d.desktop_bar),
    mobile_bar_photo: bool(r.mobile_bar_photo, d.mobile_bar_photo),
  };
}

export const sameProductPage = (a: ProductPageSettings, b: ProductPageSettings) =>
  JSON.stringify(normalizeProductPage(a)) === JSON.stringify(normalizeProductPage(b));

/** Disponibilidade mostrada perto do preço; null = não mostrar nada. */
export type Availability =
  | { kind: 'in_stock' }
  | { kind: 'low'; count: number }
  | { kind: 'made_to_order' };

/**
 * stockControlled: o produto baixa estoque (não personalizável, não digital, sem pré-venda).
 * stock: unidades da combinação escolhida (null = ainda não se sabe, por faltar cor ou tamanho).
 * madeToOrder: a ficha tem prazo de produção (produto feito depois do pedido).
 */
export function availabilityFor(o: { ready: boolean; soldOut: boolean; stockControlled: boolean; stock: number | null; madeToOrder: boolean; lowAt?: number }): Availability | null {
  if (!o.ready || o.soldOut) return null;
  if (!o.stockControlled) return o.madeToOrder ? { kind: 'made_to_order' } : null;
  if (o.stock != null && o.stock > 0 && o.stock <= (o.lowAt ?? 5)) return { kind: 'low', count: o.stock };
  return { kind: 'in_stock' };
}
