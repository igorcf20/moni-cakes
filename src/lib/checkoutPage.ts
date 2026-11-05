// =====================================================================================
// Carrinho e checkout: como a loja monta o carrinho, a gaveta e o checkout (store_settings.checkout_page).
// Admin > Pagamentos e entrega > Carrinho e checkout (AdminCheckoutPage). Leitura pública, escrita só Admin.
// Só muda a apresentação: preços, frete, estoque e pagamento continuam a ser conferidos no servidor.
// Sem a linha na base, a loja usa DEFAULT_CHECKOUT_PAGE.
// Teste: node --experimental-strip-types scripts/test-checkout-page.mjs
// =====================================================================================

/** Etapas do checkout: as já preenchidas viram uma linha com Alterar (compacto) ou ficam todas abertas. */
export type CheckoutSteps = 'compact' | 'open';
/** Topo do checkout: só o título (curto) ou título, migalhas e explicação (completo). */
export type CheckoutIntro = 'short' | 'full';
/** Campo de cupom: atrás do link "Tem um cupom?" ou sempre aberto. */
export type CouponStyle = 'link' | 'field';
/** Linhas do carrinho no celular: quantidade e subtotal ao lado da foto (compacto) ou por baixo (espaçoso). */
export type CartLines = 'compact' | 'roomy';

export type CheckoutPageSettings = {
  steps: CheckoutSteps;
  /** barra fixa no celular, no checkout: total e botão que leva ao que falta ou finaliza */
  mobile_bar: boolean;
  intro: CheckoutIntro;
  coupon: CouponStyle;
  /** selos de compra segura, produção e troca no resumo do carrinho e no checkout */
  trust: boolean;
  cart_lines: CartLines;
};

export const DEFAULT_CHECKOUT_PAGE: CheckoutPageSettings = {
  steps: 'compact',
  mobile_bar: true,
  intro: 'short',
  coupon: 'link',
  trust: true,
  cart_lines: 'compact',
};

/** Modelo "Clássico": carrinho e checkout como eram antes desta versão. */
export const CLASSIC_CHECKOUT_PAGE: CheckoutPageSettings = {
  steps: 'open',
  mobile_bar: false,
  intro: 'full',
  coupon: 'field',
  trust: true,
  cart_lines: 'roomy',
};

const pick = <V extends string>(v: unknown, allowed: readonly V[], d: V): V => (allowed.includes(v as V) ? (v as V) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Valor guardado (pode faltar ou ter lixo) -> regras completas. */
export function normalizeCheckoutPage(raw: unknown): CheckoutPageSettings {
  const r = obj(raw);
  const d = DEFAULT_CHECKOUT_PAGE;
  return {
    steps: pick(r.steps, ['compact', 'open'] as const, d.steps),
    mobile_bar: bool(r.mobile_bar, d.mobile_bar),
    intro: pick(r.intro, ['short', 'full'] as const, d.intro),
    coupon: pick(r.coupon, ['link', 'field'] as const, d.coupon),
    trust: bool(r.trust, d.trust),
    cart_lines: pick(r.cart_lines, ['compact', 'roomy'] as const, d.cart_lines),
  };
}

export const sameCheckoutPage = (a: CheckoutPageSettings, b: CheckoutPageSettings) =>
  JSON.stringify(normalizeCheckoutPage(a)) === JSON.stringify(normalizeCheckoutPage(b));

export type CheckoutStepId = 'contact' | 'delivery' | 'address' | 'billing' | 'extras' | 'payment' | 'review';

/**
 * Etapa recolhida: modo compacto, etapa completa e marcada como pronta (pela loja ao abrir a página ou pelo
 * cliente no botão Continuar). O que deixa de estar completo abre sozinho, para nunca esconder o que falta.
 * Pagamento e revisão nunca recolhem: a escolha do meio de pagamento é sempre visível.
 */
export function stepFolded(o: { steps: CheckoutSteps; id: CheckoutStepId; complete: boolean; done: ReadonlySet<CheckoutStepId> }): boolean {
  if (o.steps !== 'compact') return false;
  if (o.id === 'payment' || o.id === 'review') return false;
  return o.complete && o.done.has(o.id);
}

/** Para onde o botão da barra do celular leva: a primeira etapa com pendência (ou a revisão). */
export function nextStepTarget(blocked: ReadonlyArray<CheckoutStepId>): CheckoutStepId {
  return blocked[0] ?? 'review';
}
