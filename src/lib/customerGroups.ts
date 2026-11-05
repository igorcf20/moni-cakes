// =====================================================================================
// Grupos de clientes e tabelas de preço: a conta do preço de uma linha para um cliente de um grupo.
// Este ficheiro é igual a supabase/functions/_shared/customerGroups.ts (o teste scripts/test-customer-groups.mjs
// confere): o site mostra, o create-order confere o preço da linha com a mesma conta.
//   Preço do grupo  linha da tabela do grupo para o produto (a de maior quantidade mínima que a linha alcança):
//                   substitui o preço base (já com promoção e escalão), mas nunca fica acima dele; cor e tamanho
//                   somam por cima, como no catálogo.
//   Desconto        sem preço próprio na tabela, o desconto do grupo (%) vale sobre o preço da linha inteiro.
//   Personalizado   linhas personalizadas só recebem o desconto (%).
// O resultado nunca é maior do que o preço do catálogo: estar num grupo nunca encarece a compra.
// =====================================================================================

export type GroupPrice = { product_id: string; min_quantity: number; price: number };

export type GroupPricing = {
  group: { id: string; name: string; name_i18n: Record<string, string>; discount_percent: number } | null;
  prices: GroupPrice[];
};

export const MAX_GROUP_DISCOUNT = 90;

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function cleanI18n(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === 'object') for (const [k, t] of Object.entries(v as Record<string, unknown>)) if (typeof t === 'string' && t.trim()) out[k] = t.trim();
  return out;
}

/** Nome do grupo para o cliente no idioma (name_i18n), senão o nome do grupo. */
export function groupDisplayName(group: { name: string; name_i18n?: Record<string, string> } | null, locale: string): string {
  if (!group) return '';
  return group.name_i18n?.[locale] || group.name_i18n?.[locale.split('-')[0]] || group.name;
}

/** Linhas da tabela de preço válidas: preço >= 0, quantidade inteira de 1 a 100000, sem repetir produto e quantidade. */
export function validPriceRows(rows: GroupPrice[]): boolean {
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.product_id || !Number.isFinite(r.price) || r.price < 0) return false;
    if (!Number.isInteger(r.min_quantity) || r.min_quantity < 1 || r.min_quantity > 100000) return false;
    const k = `${r.product_id}|${r.min_quantity}`;
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}

export function normalizeGroupPricing(raw: unknown): GroupPricing {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const g = r.group && typeof r.group === 'object' ? r.group : null;
  const group = g && g.id
    ? { id: String(g.id), name: String(g.name ?? ''), name_i18n: cleanI18n(g.name_i18n), discount_percent: Math.min(MAX_GROUP_DISCOUNT, Math.max(0, num(g.discount_percent))) }
    : null;
  const prices = group && Array.isArray(r.prices)
    ? r.prices
      .map((p: any) => ({ product_id: String(p?.product_id ?? ''), min_quantity: Math.max(1, Math.floor(num(p?.min_quantity)) || 1), price: num(p?.price) }))
      .filter((p: GroupPrice) => p.product_id && p.price >= 0)
    : [];
  return { group, prices };
}

/** Linha da tabela do grupo que vale para esta quantidade (a de maior quantidade mínima alcançada). */
export function pickGroupPrice(prices: GroupPrice[], productId: string, quantity: number): GroupPrice | null {
  let best: GroupPrice | null = null;
  for (const p of prices) {
    if (p.product_id !== productId || quantity + 1e-9 < p.min_quantity) continue;
    if (!best || p.min_quantity > best.min_quantity) best = p;
  }
  return best;
}

/**
 * Preço unitário da linha para o cliente do grupo.
 * base = preço base do catálogo já com promoção e escalão (sem cor e tamanho); modifier = acréscimos de cor e tamanho.
 */
export function groupUnitPrice(
  pricing: GroupPricing,
  line: { productId: string; quantity: number; base: number; modifier: number; customized?: boolean },
): { unit: number; source: 'catalog' | 'price_list' | 'discount' } {
  const catalog = Math.max(0, line.base + line.modifier);
  if (!pricing.group) return { unit: catalog, source: 'catalog' };
  const pct = pricing.group.discount_percent;
  if (!line.customized) {
    const row = pickGroupPrice(pricing.prices, line.productId, line.quantity);
    if (row) {
      const unit = Math.min(catalog, Math.max(0, Math.min(line.base, row.price) + line.modifier));
      return { unit, source: unit < catalog ? 'price_list' : 'catalog' };
    }
  }
  if (pct > 0) return { unit: Math.round(catalog * (1 - pct / 100) * 10000) / 10000, source: 'discount' };
  return { unit: catalog, source: 'catalog' };
}
