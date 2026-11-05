// =====================================================================================
// Afiliados (recurso affiliates; Admin > Marketing > Afiliados, página /afiliados e aba Afiliado na conta).
// Regras no banco (migration 20261007140000_affiliates.sql): o pedido guarda o parceiro (create-order confere o
// código), a comissão nasce quando o pedido fica pago, com a percentagem do momento; cancelar ou reembolsar anula.
// Base da comissão = itens menos o cupom (sem frete). Aqui ficam os tipos, as regras da loja
// (store_settings.affiliates) e as contas que o site só mostra. Sem imports. Guardar o código no aparelho:
// src/lib/affiliateTracking.ts.
// Teste: node --experimental-strip-types scripts/test-affiliates.mjs
// =====================================================================================

export type AffiliateStatus = 'pending' | 'active' | 'paused' | 'rejected';

export type Affiliate = {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  user_id: string | null;
  commission_percent: number;
  status: AffiliateStatus;
  message: string | null;
  payout_info: string | null;
  admin_note: string | null;
  notes: string | null;
  approved_at: string | null;
  created_at: string;
};

export type AffiliateTotals = {
  visits: number; visits_30d: number; orders: number; orders_30d: number; sales: number; commission: number;
  pending: number; released: number; paid: number; balance: number; last_order: string | null;
};

export type AffiliateSettings = {
  /** Comissão para parceiros novos (%). */
  default_commission: number;
  /** Quantos dias o link vale depois da visita (no aparelho, com consentimento). */
  cookie_days: number;
  /** A página /afiliados aceita cadastros. */
  applications_open: boolean;
  /** Valor mínimo para pagar (só aviso no Admin e na conta). */
  min_payout: number;
};

export const AFFILIATE_DEFAULTS: AffiliateSettings = { default_commission: 5, cookie_days: 30, applications_open: true, min_payout: 0 };
/** Parâmetro do link: https://loja/?ref=<código> (também em qualquer página). */
export const AFFILIATE_PARAM = 'ref';
export const AFFILIATE_CODE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const AFFILIATE_ERRORS = [
  'forbidden', 'not_found', 'user_not_found', 'other_affiliate', 'feature_off', 'closed', 'auth_required', 'invalid',
  'already_affiliate', 'decided',
] as const;
export type AffiliateError = (typeof AFFILIATE_ERRORS)[number] | 'unknown';
/** Código estável do erro (o mais longo primeiro). */
export const affiliateErrorOf = (message: unknown): AffiliateError => {
  const m = String(message ?? '');
  return [...AFFILIATE_ERRORS].sort((a, b) => b.length - a.length).find((c) => m.includes(c)) ?? 'unknown';
};

const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** "Blog da Ána!" -> "blog-da-ana" (igual ao servidor no cadastro; até 30 letras). */
export function affiliateCode(name: string): string {
  return String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/g, '');
}

/** Código válido de um link (aceita maiúsculas e espaços à volta). */
export function cleanAffiliateCode(raw: unknown): string | null {
  const c = String(raw ?? '').trim().toLowerCase();
  return c.length >= 3 && c.length <= 40 && AFFILIATE_CODE_RE.test(c) ? c : null;
}

export function normalizeAffiliateSettings(raw: unknown): AffiliateSettings {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    default_commission: Math.round(clamp(num(o.default_commission, AFFILIATE_DEFAULTS.default_commission), 0, 100) * 100) / 100,
    cookie_days: Math.round(clamp(num(o.cookie_days, AFFILIATE_DEFAULTS.cookie_days), 1, 365)),
    applications_open: o.applications_open !== false,
    min_payout: Math.round(clamp(num(o.min_payout, 0), 0, 1_000_000) * 100) / 100,
  };
}

export function normalizeAffiliateTotals(raw: unknown): AffiliateTotals {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    visits: num(o.visits), visits_30d: num(o.visits_30d), orders: num(o.orders), orders_30d: num(o.orders_30d), sales: num(o.sales),
    commission: num(o.commission), pending: num(o.pending), released: num(o.released), paid: num(o.paid), balance: num(o.balance),
    last_order: typeof o.last_order === 'string' ? o.last_order : null,
  };
}

/** Comissão de um pedido (igual ao servidor): itens menos cupom, nunca abaixo de zero; arredondada a 2 casas. */
export function affiliateCommission(itemsTotal: number, couponDiscount: number, pct: number): { base: number; commission: number } {
  const base = Math.max(0, Math.round((num(itemsTotal) - num(couponDiscount)) * 100) / 100);
  return { base, commission: Math.round(base * clamp(num(pct), 0, 100)) / 100 };
}

/** Conversão: pedidos por visita, em %. */
export function conversionRate(t: Pick<AffiliateTotals, 'visits' | 'orders'>): number {
  return t.visits > 0 ? Math.round((t.orders / t.visits) * 1000) / 10 : 0;
}

/** Link do parceiro para uma página da loja: mantém o caminho e os outros parâmetros. */
export function affiliateLink(origin: string, code: string, path = '/'): string {
  const base = String(origin ?? '').replace(/\/+$/, '');
  let p = String(path ?? '/').trim();
  try {
    if (/^https?:\/\//i.test(p)) {
      const u = new URL(p);
      p = u.pathname + u.search + u.hash;
    }
  } catch { p = '/'; }
  if (!p.startsWith('/')) p = `/${p}`;
  const [beforeHash, hash = ''] = p.split('#');
  const [pathname, query = ''] = beforeHash.split('?');
  const params = new URLSearchParams(query);
  params.delete(AFFILIATE_PARAM);
  params.set(AFFILIATE_PARAM, code);
  return `${base}${pathname}?${params.toString()}${hash ? `#${hash}` : ''}`;
}

/** Formulário do parceiro no Admin (chaves de texto). */
export function affiliateDraftErrors(d: { name: string; code: string; commission_percent: number }, others: { id: string; code: string }[] = [], selfId?: string | null) {
  const errs: ('name' | 'code' | 'code_taken' | 'commission')[] = [];
  if (!d.name?.trim()) errs.push('name');
  if (!cleanAffiliateCode(d.code) || d.code !== d.code.trim().toLowerCase()) errs.push('code');
  else if (others.some((o) => o.id !== selfId && o.code === d.code)) errs.push('code_taken');
  if (!Number.isFinite(d.commission_percent) || d.commission_percent < 0 || d.commission_percent > 100) errs.push('commission');
  return errs;
}

/** Cadastro em /afiliados: o que falta preencher. */
export function affiliateApplicationErrors(a: { name: string; email: string }) {
  const errs: ('name' | 'email')[] = [];
  if (!a.name?.trim()) errs.push('name');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email?.trim() ?? '')) errs.push('email');
  return errs;
}
