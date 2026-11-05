// =====================================================================================
// Devoluções e trocas: listas fixas (motivos, o que o cliente quer, estados) e as regras que o site usa para mostrar
// o botão "Devolver ou trocar". O servidor confere tudo de novo em public.request_return
// (migration 20261006160300_return_requests.sql); aqui é só para mostrar.
// =====================================================================================

export const RETURN_REASONS = ['defective', 'damaged', 'wrong_item', 'not_as_described', 'size_fit', 'changed_mind', 'other'] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_ACTIONS = ['refund', 'exchange', 'repair', 'credit'] as const;
export type ReturnAction = (typeof RETURN_ACTIONS)[number];

export const RETURN_STATUSES = ['requested', 'approved', 'received', 'completed', 'rejected'] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];
export const OPEN_RETURN_STATUSES: ReturnStatus[] = ['requested', 'approved', 'received'];

export type ReturnSettings = { enabled: boolean; days: number; actions: ReturnAction[] };
export const DEFAULT_RETURN_SETTINGS: ReturnSettings = { enabled: true, days: 30, actions: ['refund', 'exchange'] };

export type ReturnItem = { order_item_id: string; product_id: string | null; name: string; quantity: number };

export type ReturnRequest = {
  id: string;
  order_id: string;
  user_id: string;
  items: ReturnItem[];
  reason: ReturnReason;
  action: ReturnAction;
  comment: string | null;
  status: ReturnStatus;
  store_reply: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

/** Colunas que o site pode ler (as notas internas ficam de fora: só o Admin as lê pela função admin_return_notes). */
export const RETURN_COLUMNS = 'id,order_id,user_id,items,reason,action,comment,status,store_reply,created_at,updated_at,resolved_at';

/** Estados do pedido em que o cliente já pode pedir devolução (igual ao servidor). */
export const RETURNABLE_ORDER_STATUSES = ['shipped', 'delivered', 'completed', 'ready_for_pickup'];

export function normalizeReturnSettings(v: unknown): ReturnSettings {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const days = Number(o.days);
  const actions = Array.isArray(o.actions) ? o.actions.filter((a): a is ReturnAction => RETURN_ACTIONS.includes(a as ReturnAction)) : null;
  return {
    enabled: o.enabled !== false,
    days: Number.isFinite(days) && days >= 0 ? Math.min(365, Math.round(days)) : DEFAULT_RETURN_SETTINGS.days,
    actions: actions && actions.length ? [...new Set(actions)] : DEFAULT_RETURN_SETTINGS.actions,
  };
}

type OrderLike = { status: string; created_at: string | null; shipped_at?: string | null; delivered_at?: string | null };

/** Último dia para pedir devolução (a contar da entrega; sem data de entrega, do envio ou da compra). */
export function returnDeadline(order: OrderLike, settings: ReturnSettings): Date | null {
  const since = order.delivered_at || order.shipped_at || order.created_at;
  if (!since) return null;
  const d = new Date(since);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + settings.days * 86_400_000);
}

/** O cliente pode pedir devolução deste pedido agora? (sem contar com pedidos de devolução já abertos) */
export function canRequestReturn(order: OrderLike, settings: ReturnSettings, now = new Date()): boolean {
  if (!settings.enabled || !RETURNABLE_ORDER_STATUSES.includes(order.status)) return false;
  const deadline = returnDeadline(order, settings);
  return !!deadline && deadline.getTime() >= now.getTime();
}

/** Quanto de cada item ainda pode ser devolvido (comprado menos o que já está em devoluções não recusadas). */
export function returnableQuantities(
  items: { id: string; quantity: number }[],
  requests: Pick<ReturnRequest, 'status' | 'items'>[],
): Record<string, number> {
  const used: Record<string, number> = {};
  for (const r of requests) {
    if (r.status === 'rejected') continue;
    for (const it of r.items ?? []) used[it.order_item_id] = (used[it.order_item_id] ?? 0) + Number(it.quantity || 0);
  }
  const out: Record<string, number> = {};
  for (const it of items) out[it.id] = Math.max(0, Number(it.quantity || 0) - (used[it.id] ?? 0));
  return out;
}

/** Erros conhecidos do servidor (códigos estáveis) para o texto certo no site. */
export const RETURN_ERRORS = [
  'returns_disabled', 'invalid_reason', 'invalid_action', 'comment_too_long', 'order_not_found', 'order_not_delivered',
  'return_window_closed', 'return_already_open', 'no_items', 'invalid_item', 'invalid_quantity',
] as const;
export type ReturnError = (typeof RETURN_ERRORS)[number];

export function returnErrorCode(e: unknown): ReturnError | null {
  const msg = String((e as { message?: string })?.message ?? e ?? '');
  return RETURN_ERRORS.find((c) => msg.includes(c)) ?? null;
}
