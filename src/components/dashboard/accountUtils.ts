// Funções partilhadas pela área do cliente (login, minha conta, pedidos, rastreio). Sem JSX.
import { accountMessages, type AccountKey } from '@/i18n/account';

/** Número curto do pedido mostrado ao cliente (#A1B2C3D4). */
export const orderCode = (id: string) => String(id || '').slice(0, 8).toUpperCase();

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SHORT_ORDER_RE = /^[0-9a-f]{8}$/i;

const KEYS = accountMessages['pt-BR'];
export const isAccountKey = (k: string): k is AccountKey => Object.prototype.hasOwnProperty.call(KEYS, k);

/** Chave do rótulo traduzido do estado do pedido (ou null para estados desconhecidos). */
// Nomes antigos ou alternativos do mesmo estado (dados da loja anterior e notifyOrderEmail).
const STATUS_ALIAS: Record<string, string> = { in_production: 'preparing', processing: 'preparing' };

export const statusKey = (status: string | null | undefined): AccountKey | null => {
  const k = `status_${STATUS_ALIAS[status ?? ''] ?? status ?? ''}`;
  return isAccountKey(k) ? k : null;
};

/** Chave do rótulo traduzido do meio de pagamento (ou null). */
export const paymentKey = (method: string | null | undefined): AccountKey | null => {
  const k = `pay_${method ?? ''}`;
  return isAccountKey(k) ? k : null;
};

/** Regras da senha forte (as mesmas no cadastro, na recuperação e na troca de senha). */
export const PASSWORD_RULES: { id: string; key: AccountKey; test: (p: string) => boolean }[] = [
  { id: 'len', key: 'pwLen', test: (p) => p.length >= 8 },
  { id: 'upper', key: 'pwUpper', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', key: 'pwLower', test: (p) => /[a-z]/.test(p) },
  { id: 'digit', key: 'pwDigit', test: (p) => /[0-9]/.test(p) },
  { id: 'symbol', key: 'pwSymbol', test: (p) => /[^A-Za-z0-9]/.test(p) },
];
export const passwordOk = (p: string) => PASSWORD_RULES.every((r) => r.test(p));

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mensagem do Supabase Auth (em inglês) para a chave do texto traduzido. */
export function authErrorKey(message: string | null | undefined): AccountKey {
  const m = String(message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'authBadCredentials';
  if (m.includes('not confirmed')) return 'authNotConfirmed';
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('already exists')) return 'authAlreadyRegistered';
  if (m.includes('should be different')) return 'authSamePassword';
  if (m.includes('password') && (m.includes('weak') || m.includes('at least') || m.includes('characters') || m.includes('pwned'))) return 'authWeakPassword';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('for security purposes')) return 'authRateLimit';
  if (m.includes('signups not allowed') || m.includes('signup is disabled') || m.includes('signups are disabled')) return 'authSignupDisabled';
  if (m.includes('expired') || (m.includes('token') && m.includes('invalid'))) return 'authLinkExpired';
  if (m.includes('email') && m.includes('invalid')) return 'errEmail';
  return 'genericError';
}

/** Lista "a, b e c" no idioma pedido (Intl.ListFormat quando existir). */
export function joinList(items: string[], locale: string): string {
  try {
    const LF = (Intl as any).ListFormat;
    if (LF) return new LF(locale, { style: 'long', type: 'conjunction' }).format(items);
  } catch { /* navegador antigo */ }
  return items.join(', ');
}

/** Linhas de um endereço gravado (mesmos campos em todos os países: street, number, complement, parish, city, district, postal_code). */
export function addressLines(a: any, countryLabel?: string | null): string[] {
  if (!a) return [];
  const line1 = [a.street, a.number, a.complement].map((v) => String(v ?? '').trim()).filter(Boolean).join(', ');
  const line2 = [a.parish, a.city, a.district || a.state].map((v) => String(v ?? '').trim()).filter(Boolean).join(', ');
  const line3 = [a.postal_code || a.zip_code, countryLabel].map((v) => String(v ?? '').trim()).filter(Boolean).join(', ');
  return [line1, line2, line3].filter(Boolean);
}

/** Iniciais para o avatar (nome ou e-mail). */
export function initialsOf(nameOrEmail: string): string {
  const parts = String(nameOrEmail || '').split(/[\s@._-]+/).filter(Boolean);
  return (parts.slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || 'C');
}

/** Etapa do andamento do pedido (OrderProgress): 0 feito, 1 pago, 2 produção, 3 envio ou retirada, 4 entregue. */
export const PROGRESS_STEP: Record<string, number> = {
  pending: 0,
  awaiting_payment: 0,
  paid: 1,
  preparing: 2,
  in_production: 2,
  processing: 2,
  shipped: 3,
  ready_for_pickup: 3,
  delivered: 4,
  completed: 4,
};

export const isProgressStatus = (status: string) => status in PROGRESS_STEP;
