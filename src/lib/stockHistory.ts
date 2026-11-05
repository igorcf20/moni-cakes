// =============================================================================================
// Histórico de estoque (recurso stock_history; Admin > Catálogo > Histórico de estoque e bloco na página de números
// do produto). Regras puras usadas pelas telas; o registo e os ajustes são do servidor:
//   stock_movements (escrito só por triggers), admin_adjust_stock, admin_stock_movements, admin_stock_summary
//   (migration 20261007030000_stock_history.sql).
// Sem imports. Teste: node --experimental-strip-types scripts/test-stock-history.mjs
// =============================================================================================

/** Motivos gravados no histórico (iguais ao CHECK da tabela). */
export const STOCK_REASONS = ['sale', 'order_restock', 'order_edit', 'admin', 'receive', 'count', 'damage', 'other', 'system'] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

/** Motivos que o Admin escolhe ao ajustar o estoque (admin_adjust_stock). */
export const ADJUST_REASONS = ['receive', 'count', 'damage', 'other'] as const;
export type AdjustReason = (typeof ADJUST_REASONS)[number];

/** Grupos de filtro da lista: vendas, pedidos devolvidos ao estoque, ajustes do Admin e outros. */
export const REASON_GROUPS = {
  sales: ['sale', 'order_edit'],
  restock: ['order_restock'],
  manual: ['admin', 'receive', 'count', 'damage', 'other'],
  system: ['system'],
} as const satisfies Record<string, readonly StockReason[]>;
export type ReasonGroup = keyof typeof REASON_GROUPS | 'all';

export const reasonsOf = (g: ReasonGroup): StockReason[] | null => (g === 'all' ? null : [...REASON_GROUPS[g]]);

export type AdjustMode = 'set' | 'add';

/** Estoque depois do ajuste (como o servidor calcula). null = valor inválido (não inteiro ou estoque negativo). */
export function adjustResult(mode: AdjustMode, current: number | null, value: number): number | null {
  if (!Number.isInteger(value)) return null;
  const next = mode === 'set' ? value : (current ?? 0) + value;
  return next < 0 ? null : next;
}

export type StockPeriod = '7d' | '30d' | '90d' | '365d' | 'all';
const DAYS: Record<Exclude<StockPeriod, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };

/** Início do período (ISO) ou null para todo o histórico. */
export function periodSince(p: StockPeriod, now = new Date()): string | null {
  return p === 'all' ? null : new Date(now.getTime() - DAYS[p] * 86_400_000).toISOString();
}

export type SummaryRow = { reason: string; units_in: number; units_out: number; movements: number };

/** Totais do período: entradas, saídas, vendidas e ajustes manuais. */
export function summaryTotals(rows: SummaryRow[]) {
  const sum = (pick: (r: SummaryRow) => number, only?: readonly string[]) =>
    rows.filter((r) => !only || only.includes(r.reason)).reduce((s, r) => s + Number(pick(r) || 0), 0);
  return {
    unitsIn: sum((r) => r.units_in),
    unitsOut: sum((r) => r.units_out),
    sold: sum((r) => r.units_out, REASON_GROUPS.sales) - sum((r) => r.units_in, REASON_GROUPS.sales),
    restocked: sum((r) => r.units_in, REASON_GROUPS.restock),
    manual: sum((r) => r.movements, REASON_GROUPS.manual),
    movements: sum((r) => r.movements),
  };
}

/** Nome da parte do produto que mudou: produto, cor, tamanho ou cor x tamanho. */
export function movementTarget(m: { variation_name?: string | null; size_label?: string | null }): string | null {
  const parts = [m.variation_name, m.size_label].map((x) => (x ?? '').trim()).filter(Boolean);
  return parts.length ? parts.join(' / ') : null;
}

/** Erro estável do servidor (admin_adjust_stock) a partir da mensagem do Postgres. */
export function adjustErrorCode(message: string | null | undefined): 'forbidden' | 'not_found' | 'invalid_value' | 'invalid_reason' | 'unknown' {
  const m = String(message ?? '');
  for (const c of ['forbidden', 'not_found', 'invalid_value', 'invalid_reason'] as const) if (m.includes(c)) return c;
  return 'unknown';
}
