// =====================================================================================
// Marketplace com vendedores (recurso marketplace; Admin > Vendas > Vendedores, /vendedor/<slug>, /vender e aba
// Vendedor na conta). Regras no banco (migration 20261007130000_marketplace.sql): o livro vendor_ledger nasce quando o
// pedido fica pago, com a comissão do momento; cancelar ou reembolsar anula. Aqui ficam os tipos, as regras da loja
// (store_settings.marketplace) e as contas que o site só mostra. Sem imports.
// Teste: node --experimental-strip-types scripts/test-marketplace.mjs
// =====================================================================================

export type Vendor = {
  id: string;
  slug: string;
  name: string;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  description_i18n: Record<string, string>;
  commission_percent: number;
  is_active: boolean;
  notes: string | null;
};

export type PublicVendor = Pick<Vendor, 'id' | 'slug' | 'name' | 'logo_url' | 'description_i18n'>;

export type VendorTotals = {
  orders: number; units: number; gross: number; commission: number; net: number; gross_30d: number;
  net_undelivered: number; paid: number; balance: number; last_sale: string | null; products: number; members: number;
};

export type MarketplaceSettings = {
  /** Comissão da loja para vendedores novos (%). */
  default_commission: number;
  /** A página /vender aceita pedidos de cadastro. */
  applications_open: boolean;
  /** Mostra "Vendido por" na página do produto. */
  show_vendor: boolean;
};

export const MARKETPLACE_DEFAULTS: MarketplaceSettings = { default_commission: 10, applications_open: true, show_vendor: true };

export const MARKETPLACE_ERRORS = [
  'forbidden', 'not_found', 'user_not_found', 'other_vendor', 'feature_off', 'closed', 'auth_required', 'invalid',
  'already_vendor', 'already_applied', 'decided', 'untracked', 'invalid_value',
] as const;
export type MarketplaceError = (typeof MARKETPLACE_ERRORS)[number] | 'unknown';
/** Código estável do erro (o mais longo primeiro, para "invalid_value" não virar "invalid"). */
export const marketplaceErrorOf = (message: unknown): MarketplaceError => {
  const m = String(message ?? '');
  return [...MARKETPLACE_ERRORS].sort((a, b) => b.length - a.length).find((c) => m.includes(c)) ?? 'unknown';
};

export const VENDOR_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Cerâmica São José" -> "ceramica-sao-jose" (igual ao servidor ao aprovar um cadastro). */
export function vendorSlug(name: string): string {
  return String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/g, '');
}

const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const clampPct = (v: unknown, d: number) => Math.min(100, Math.max(0, Math.round(num(v, d) * 100) / 100));

export function normalizeMarketplaceSettings(raw: unknown): MarketplaceSettings {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    default_commission: clampPct(o.default_commission ?? MARKETPLACE_DEFAULTS.default_commission, MARKETPLACE_DEFAULTS.default_commission),
    applications_open: o.applications_open !== false,
    show_vendor: o.show_vendor !== false,
  };
}

export function normalizeTotals(raw: unknown): VendorTotals {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    orders: num(o.orders), units: num(o.units), gross: num(o.gross), commission: num(o.commission), net: num(o.net),
    gross_30d: num(o.gross_30d), net_undelivered: num(o.net_undelivered), paid: num(o.paid), balance: num(o.balance),
    last_sale: typeof o.last_sale === 'string' ? o.last_sale : null, products: num(o.products), members: num(o.members),
  };
}

/** Comissão e parte do vendedor de um valor (igual ao servidor: comissão arredondada a 2 casas). */
export function splitSale(gross: number, commissionPercent: number): { commission: number; net: number } {
  const g = Math.round(num(gross) * 100) / 100;
  const commission = Math.round(g * clampPct(commissionPercent, 0)) / 100;
  return { commission, net: Math.round((g - commission) * 100) / 100 };
}

/** Descrição no idioma, senão pt-BR, senão a primeira. */
export function vendorDescription(v: Pick<Vendor, 'description_i18n'>, locale: string): string {
  const m = v.description_i18n ?? {};
  const pick = (k: string) => (typeof m[k] === 'string' && m[k].trim() ? m[k].trim() : '');
  return pick(locale) || pick('pt-BR') || Object.values(m).find((x) => typeof x === 'string' && x.trim())?.trim() || '';
}

/** Erros do formulário do vendedor no Admin (chaves de texto). */
export function vendorDraftErrors(d: { name: string; slug: string; commission_percent: number }, others: { id: string; slug: string }[] = [], selfId?: string | null) {
  const errs: ('name' | 'slug' | 'slug_taken' | 'commission')[] = [];
  if (!d.name?.trim()) errs.push('name');
  if (!VENDOR_SLUG_RE.test(d.slug ?? '') || d.slug.length > 80) errs.push('slug');
  else if (others.some((o) => o.id !== selfId && o.slug === d.slug)) errs.push('slug_taken');
  if (!Number.isFinite(d.commission_percent) || d.commission_percent < 0 || d.commission_percent > 100) errs.push('commission');
  return errs;
}

/** Pedido de cadastro: o que falta preencher. */
export function applicationErrors(a: { store_name: string; email: string }) {
  const errs: ('store_name' | 'email')[] = [];
  if (!a.store_name?.trim()) errs.push('store_name');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email?.trim() ?? '')) errs.push('email');
  return errs;
}

/** Endereço de entrega numa linha para o vendedor. */
export function shipToLines(s: Record<string, string | undefined> | null | undefined): string[] {
  if (!s) return [];
  const street = [s.street, s.number].filter(Boolean).join(', ');
  return [s.name, [street, s.complement].filter(Boolean).join(' '), s.parish, [s.postal_code, s.city, s.district].filter(Boolean).join(' '), s.country, s.phone]
    .map((x) => (x ?? '').trim()).filter(Boolean);
}
