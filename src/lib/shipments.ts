// =====================================================================================
// Envios parciais (recurso partial_shipments): contas das remessas de um pedido, iguais às regras do servidor
// (migration 20261007080000_order_shipments.sql, admin_save_shipment e _order_shipments_sync).
//   remainingByItem   quanto de cada item ainda não está em nenhuma remessa (sem contar a remessa em edição)
//   draftErrors       o que o Admin escreveu cabe? (mesmos códigos do servidor: no_items, too_many, invalid_item)
//   shipmentProgress  quantas unidades saíram e chegaram; estado none / partial / shipped / delivered
// Sem imports com @/ para o teste em node (scripts/test-shipments.mjs).
// =====================================================================================

export const SHIPMENT_STATUSES = ['preparing', 'shipped', 'delivered'] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export type ShipmentItem = { order_item_id: string; quantity: number };
export type Shipment = {
  id: string;
  order_id: string;
  number: number;
  status: ShipmentStatus;
  carrier: string | null;
  tracking_code: string | null;
  tracking_url: string | null;
  note: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  items: ShipmentItem[];
};
export type OrderLine = { id: string; quantity: number };

/** Estados de pedido em que já não se cria remessa. */
export const CLOSED_ORDER_STATUSES = ['cancelled', 'refunded'];

const qty = (n: unknown) => Math.max(0, Math.floor(Number(n) || 0));

/** Unidades de cada item ainda fora de remessas (exceptId = remessa em edição, que não conta). */
export function remainingByItem(lines: OrderLine[], shipments: Shipment[], exceptId?: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) out[l.id] = qty(l.quantity);
  for (const s of shipments) {
    if (exceptId && s.id === exceptId) continue;
    for (const it of s.items) if (it.order_item_id in out) out[it.order_item_id] -= qty(it.quantity);
  }
  for (const k of Object.keys(out)) out[k] = Math.max(0, out[k]);
  return out;
}

export type DraftError = 'no_items' | 'too_many' | 'invalid_item';

/** Itens da remessa (quantidades > 0) e o primeiro erro, se houver. */
export function draftErrors(draft: Record<string, number>, remaining: Record<string, number>): { items: ShipmentItem[]; error: DraftError | null } {
  const items: ShipmentItem[] = [];
  for (const [id, raw] of Object.entries(draft)) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return { items, error: 'invalid_item' };
    if (n === 0) continue;
    if (!(id in remaining)) return { items, error: 'invalid_item' };
    if (n > remaining[id]) return { items, error: 'too_many' };
    items.push({ order_item_id: id, quantity: n });
  }
  return { items, error: items.length ? null : 'no_items' };
}

export type ShipmentProgress = { total: number; shipped: number; delivered: number; state: 'none' | 'partial' | 'shipped' | 'delivered' };

/** Unidades do pedido que saíram (remessa enviada ou entregue) e que chegaram. */
export function shipmentProgress(lines: OrderLine[], shipments: Shipment[]): ShipmentProgress {
  const total = lines.reduce((s, l) => s + qty(l.quantity), 0);
  let shipped = 0;
  let delivered = 0;
  for (const s of shipments) {
    const n = s.items.reduce((sum, it) => sum + qty(it.quantity), 0);
    if (s.status === 'shipped' || s.status === 'delivered') shipped += n;
    if (s.status === 'delivered') delivered += n;
  }
  shipped = Math.min(shipped, total);
  delivered = Math.min(delivered, total);
  const state = total > 0 && delivered >= total ? 'delivered' : total > 0 && shipped >= total ? 'shipped' : shipped > 0 ? 'partial' : 'none';
  return { total, shipped, delivered, state };
}

/** Normaliza linhas lidas da base (remessa + itens). */
export function normalizeShipments(rows: unknown): Shipment[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && typeof r === 'object' && typeof (r as Shipment).id === 'string')
    .map((r) => {
      const s = r as Shipment & { order_shipment_items?: ShipmentItem[] };
      const status = (SHIPMENT_STATUSES as readonly string[]).includes(s.status) ? s.status : 'shipped';
      const items = (Array.isArray(s.items) ? s.items : Array.isArray(s.order_shipment_items) ? s.order_shipment_items : [])
        .map((it) => ({ order_item_id: String(it.order_item_id), quantity: qty(it.quantity) }))
        .filter((it) => it.quantity > 0);
      return { ...s, status, items } as Shipment;
    })
    .sort((a, b) => a.number - b.number);
}
