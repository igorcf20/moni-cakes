// =====================================================================================
// Vários armazéns (recurso warehouses; Admin > Catálogo > Armazéns e bloco Armazéns na página do pedido).
// O estoque que a loja mostra continua no produto, cor, tamanho ou cor x tamanho; os armazéns dizem onde estão as
// unidades. Regras no banco (migration 20261007120000_warehouses.sql, trigger warehouse_stock_sync e funções
// admin_warehouse_*). Aqui ficam os tipos, a validação do formulário e a mesma ordem de saída do servidor, para o
// Admin explicar de onde sai um pedido. Sem imports. Teste: node --experimental-strip-types scripts/test-warehouses.mjs
// =====================================================================================

export type Warehouse = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  /** Países que este armazém atende primeiro (vazio = todos). */
  serves_countries: string[];
  /** Menor número sai primeiro. */
  priority: number;
  is_default: boolean;
  is_active: boolean;
  notes: string | null;
};

export type WarehouseDraft = Omit<Warehouse, 'id' | 'is_default'> & { is_default: boolean };

export const WAREHOUSE_ERRORS = [
  'forbidden', 'not_found', 'untracked', 'invalid_value', 'invalid_reason', 'same_warehouse', 'insufficient', 'warehouse_has_stock',
] as const;
export type WarehouseError = (typeof WAREHOUSE_ERRORS)[number] | 'unknown';
export const warehouseErrorOf = (message: unknown): WarehouseError =>
  WAREHOUSE_ERRORS.find((c) => String(message ?? '').includes(c)) ?? 'unknown';

/** Motivos de ajuste (os mesmos do Histórico de estoque). */
export const WAREHOUSE_REASONS = ['receive', 'count', 'damage', 'other'] as const;
export type WarehouseReason = (typeof WAREHOUSE_REASONS)[number];

const str = (v: unknown, max: number): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : null;
};

/** Códigos ISO de país escritos à mão ("br, pt es") ou em lista: maiúsculos, sem repetidos, ordenados. */
export function parseCountryList(v: unknown): string[] {
  const parts = Array.isArray(v) ? v.map(String) : String(v ?? '').split(/[\s,;]+/);
  return [...new Set(parts.map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)))].sort();
}

export function normalizeWarehouse(raw: unknown): Warehouse {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const prio = Math.floor(Number(o.priority));
  const country = str(o.country, 10)?.toUpperCase() ?? null;
  return {
    id: String(o.id ?? ''),
    name: str(o.name, 120) ?? '',
    code: str(o.code, 30)?.toUpperCase() ?? null,
    address: str(o.address, 500),
    city: str(o.city, 120),
    country: country && /^[A-Z]{2}$/.test(country) ? country : null,
    serves_countries: parseCountryList(o.serves_countries),
    priority: Number.isFinite(prio) ? Math.min(10000, Math.max(0, prio)) : 100,
    is_default: o.is_default === true,
    is_active: o.is_active !== false,
    notes: str(o.notes, 2000),
  };
}

/** Erros do formulário (chaves de texto). */
export function warehouseDraftErrors(d: Pick<WarehouseDraft, 'name' | 'code' | 'priority'>, others: Pick<Warehouse, 'id' | 'code'>[] = [], selfId?: string | null) {
  const errs: ('name' | 'code_taken' | 'priority')[] = [];
  if (!d.name?.trim()) errs.push('name');
  const code = d.code?.trim().toUpperCase();
  if (code && others.some((w) => w.id !== selfId && (w.code ?? '').toUpperCase() === code)) errs.push('code_taken');
  if (!Number.isFinite(d.priority) || d.priority < 0 || d.priority > 10000) errs.push('priority');
  return errs;
}

/**
 * Ordem em que os armazéns entregam um pedido (igual a warehouse_stock_sync): ativos primeiro; depois os que
 * atendem o país de entrega, os que atendem todos, os outros; depois a prioridade, o padrão e o nome.
 */
export function pickOrder<W extends Pick<Warehouse, 'is_active' | 'serves_countries' | 'priority' | 'is_default' | 'name'>>(list: W[], country?: string | null): W[] {
  const c = (country ?? '').toUpperCase() || null;
  const rank = (w: W) => (c && w.serves_countries.includes(c) ? 0 : w.serves_countries.length === 0 ? 1 : 2);
  return [...list].sort((a, b) =>
    Number(b.is_active) - Number(a.is_active)
    || rank(a) - rank(b)
    || a.priority - b.priority
    || Number(b.is_default) - Number(a.is_default)
    || a.name.localeCompare(b.name));
}

/** Simulação de uma saída: quanto sai de cada armazém (e quanto falta, se faltar). */
export function planTake<W extends Pick<Warehouse, 'id' | 'is_active' | 'serves_countries' | 'priority' | 'is_default' | 'name'>>(
  list: W[], stock: Record<string, number>, quantity: number, country?: string | null,
): { takes: { id: string; quantity: number }[]; missing: number } {
  let need = Math.max(0, Math.floor(quantity));
  const takes: { id: string; quantity: number }[] = [];
  for (const w of pickOrder(list.filter((x) => (stock[x.id] ?? 0) > 0), country)) {
    if (need <= 0) break;
    const take = Math.min(need, stock[w.id] ?? 0);
    takes.push({ id: w.id, quantity: take });
    need -= take;
  }
  return { takes, missing: need };
}

/** Uma parte do estoque: produto, cor, tamanho ou cor x tamanho. */
export type SlotRef = { product_id: string; variation_id: string | null; size_id: string | null };
export const slotKey = (s: SlotRef) => `${s.product_id}|${s.variation_id ?? ''}|${s.size_id ?? ''}`;
export const slotLabel = (s: { variation_name?: string | null; size_label?: string | null }) =>
  [s.variation_name, s.size_label].filter(Boolean).join(' / ') || null;

/** Soma das unidades por armazém de uma parte. */
export const sumPerWarehouse = (per: Record<string, number> | null | undefined) =>
  Object.values(per ?? {}).reduce((s, n) => s + (Number(n) || 0), 0);

/** Endereço numa linha para listas. */
export const warehousePlace = (w: Pick<Warehouse, 'city' | 'country'>) => [w.city, w.country].filter(Boolean).join(', ') || null;
