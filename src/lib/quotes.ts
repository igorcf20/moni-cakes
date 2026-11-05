// =====================================================================================
// Pedido de orçamento B2B (recurso quotes; Admin > Vendas > Orçamentos, página /pedido-de-orcamento e aba Orçamentos
// na conta). Regras no banco (migration 20261007150000_quotes.sql): o cliente pede, a loja responde com o preço de
// cada item e a validade, o cliente aceita e compra pelo checkout normal. O preço do orçamento só vale no servidor
// (_shared/pricing.ts confere dono, estado, validade, produto, cor, tamanho e quantidade). Aqui ficam os tipos, as
// regras da loja (store_settings.quotes) e as contas que o site só mostra. Sem imports.
// Teste: node --experimental-strip-types scripts/test-quotes.mjs
// =====================================================================================

export type QuoteStatus = 'new' | 'sent' | 'accepted' | 'ordered' | 'declined' | 'rejected' | 'cancelled';
/** Estado mostrado: o do banco, ou "expired" quando a proposta passou da validade. */
export type QuoteView = QuoteStatus | 'expired';

export type QuoteItem = {
  id: string;
  product_id: string;
  name?: string | null;
  slug?: string | null;
  image?: string | null;
  variation_id: string | null;
  variation_name: string | null;
  size_label: string | null;
  quantity: number;
  list_price: number;
  target_price: number | null;
  note: string | null;
  unit_price: number | null;
};

export type Quote = {
  id: string;
  number: number;
  status: QuoteStatus;
  company: string | null;
  contact_name: string;
  phone: string | null;
  message: string | null;
  store_message: string | null;
  valid_until: string | null;
  order_id: string | null;
  sent_at: string | null;
  decided_at: string | null;
  created_at: string;
  items: QuoteItem[];
};

export type QuoteSettings = {
  /** Validade padrão da proposta (dias). */
  valid_days: number;
  /** Botão "Pedir orçamento" na página do produto. */
  product_button: boolean;
  /** Botão "Pedir orçamento" no carrinho. */
  cart_button: boolean;
  /** Mínimo de unidades somadas para pedir. */
  min_quantity: number;
};

export const QUOTE_DEFAULTS: QuoteSettings = { valid_days: 15, product_button: true, cart_button: true, min_quantity: 1 };
export const QUOTE_PATH = '/pedido-de-orcamento';
export const QUOTE_STATUSES: QuoteStatus[] = ['new', 'sent', 'accepted', 'ordered', 'declined', 'rejected', 'cancelled'];

export const QUOTE_ERRORS = [
  'feature_off', 'auth_required', 'empty', 'invalid', 'too_many', 'min_quantity', 'not_found', 'invalid_status', 'expired',
  'forbidden', 'ordered', 'missing_price',
] as const;
export type QuoteError = (typeof QUOTE_ERRORS)[number] | 'unknown';
/** Código estável do erro (o mais longo primeiro, para "invalid_status" não virar "invalid"). */
export const quoteErrorOf = (message: unknown): QuoteError => {
  const m = String(message ?? '');
  return [...QUOTE_ERRORS].sort((a, b) => b.length - a.length).find((c) => m.includes(c)) ?? 'unknown';
};

const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const r2 = (v: number) => Math.round(v * 100) / 100;

export function normalizeQuoteSettings(raw: unknown): QuoteSettings {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    valid_days: Math.min(365, Math.max(1, Math.round(num(o.valid_days, QUOTE_DEFAULTS.valid_days)))),
    product_button: o.product_button !== false,
    cart_button: o.cart_button !== false,
    min_quantity: Math.min(100000, Math.max(1, Math.round(num(o.min_quantity, 1)))),
  };
}

/** Data (AAAA-MM-DD) de hoje mais n dias, no fuso local. */
export function addDaysISO(n: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Estado para mostrar: proposta enviada ou aceita com a validade passada aparece como vencida. */
export function quoteView(q: Pick<Quote, 'status' | 'valid_until'>, today = addDaysISO(0)): QuoteView {
  if ((q.status === 'sent' || q.status === 'accepted') && q.valid_until && q.valid_until < today) return 'expired';
  return q.status;
}

/** O cliente pode comprar com esta proposta agora. */
export const canBuy = (q: Pick<Quote, 'status' | 'valid_until' | 'order_id'>, today?: string) =>
  ['sent', 'accepted'].includes(quoteView(q, today)) && !q.order_id;

/** Totais: tabela (preço de catálogo), proposta e economia (só quando todos os itens têm preço). */
export function quoteTotals(items: Pick<QuoteItem, 'quantity' | 'list_price' | 'unit_price'>[]) {
  const list = r2(items.reduce((s, i) => s + num(i.list_price) * num(i.quantity), 0));
  const priced = items.length > 0 && items.every((i) => i.unit_price != null);
  const offer = priced ? r2(items.reduce((s, i) => s + num(i.unit_price) * num(i.quantity), 0)) : null;
  const units = items.reduce((s, i) => s + num(i.quantity), 0);
  const saving = offer != null && list > 0 ? Math.max(0, Math.round((1 - offer / list) * 1000) / 10) : 0;
  return { list, offer, units, saving };
}

/** Preço do item com o desconto de x% sobre a tabela (atalho do Admin). */
export const discounted = (listPrice: number, pct: number) => r2(Math.max(0, num(listPrice) * (1 - Math.min(100, Math.max(0, num(pct))) / 100)));

/** Linha do carrinho de um item da proposta (o servidor confere tudo de novo em create-order). */
export function quoteCartLine(q: Pick<Quote, 'id'>, i: QuoteItem) {
  return {
    productId: i.product_id,
    quantity: i.quantity,
    variationId: i.variation_id ?? undefined,
    sizeLabel: i.size_label ?? undefined,
    designData: {
      name: i.name ?? '',
      image: i.image ?? '',
      price: num(i.unit_price),
      ...(i.variation_name ? { variation: i.variation_name } : {}),
      ...(i.size_label ? { size: i.size_label } : {}),
      quote: { id: q.id, item_id: i.id, unit: num(i.unit_price) },
    },
  };
}

/** Item do pedido de orçamento no formulário. */
export type QuoteDraftItem = {
  key: string;
  product_id: string;
  name: string;
  image: string | null;
  list_price: number;
  variation_id: string | null;
  variation_name: string | null;
  size_label: string | null;
  quantity: number;
  target_price: string;
  note: string;
};

/** O que falta no pedido de orçamento (chaves de texto). */
export function quoteDraftErrors(d: { contact: string; items: Pick<QuoteDraftItem, 'quantity' | 'target_price'>[] }, minQuantity = 1) {
  const errs: ('contact' | 'items' | 'quantity' | 'target' | 'min_quantity')[] = [];
  if (!d.contact?.trim()) errs.push('contact');
  if (!d.items.length) errs.push('items');
  if (d.items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 100000)) errs.push('quantity');
  if (d.items.some((i) => i.target_price.trim() !== '' && !(num(i.target_price.replace(',', '.'), -1) >= 0))) errs.push('target');
  if (d.items.length && d.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0) < Math.max(1, minQuantity)) errs.push('min_quantity');
  return errs;
}

/** Corpo do request_quote. */
export function quotePayloadItems(items: QuoteDraftItem[]) {
  return items.map((i) => ({
    product_id: i.product_id,
    quantity: i.quantity,
    variation_id: i.variation_id,
    size_label: i.size_label,
    target_price: i.target_price.trim() === '' ? null : r2(num(i.target_price.replace(',', '.'))),
    note: i.note.trim() || null,
  }));
}

/** Número curto do orçamento para mostrar. */
export const quoteRef = (n: number) => `ORC-${n}`;
