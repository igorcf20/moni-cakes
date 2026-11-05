// =====================================================================================
// Vale-presente: regras puras usadas pelo checkout (GiftCardInput) e pelo Admin (AdminGiftCards).
// As regras de verdade ficam no servidor (migration 20261006190000_gift_cards.sql e create-order); aqui só o que o
// navegador mostra. Sem imports com @/ (teste em node, scripts/test-gift-cards.mjs).
// =====================================================================================

/** Letras e números sem os que se confundem (0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Só letras e números, maiúsculas (igual a public.gift_card_normalize). */
export const normalizeGiftCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Mostra em grupos de 4: ABCD-EFGH-JKLM-NPQR. */
export const formatGiftCode = (v: string) => normalizeGiftCode(v).replace(/(.{4})(?=.)/g, '$1-');

/** Últimos 4 caracteres (para o resumo do pedido). */
export const giftCodeTail = (v: string) => normalizeGiftCode(v).slice(-4);

/** Código válido para gravar (6 a 32 letras ou números). */
export const isGiftCode = (v: string) => /^[A-Z0-9]{6,32}$/.test(normalizeGiftCode(v));

/** Código novo e aleatório (16 caracteres, do gerador seguro do navegador). */
export function generateGiftCode(length = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Quanto o vale desconta: o saldo, até zerar o pedido (centavos arredondados). */
export function giftApplied(balance: number, total: number): number {
  const v = Math.min(Math.max(0, balance), Math.max(0, total));
  return Math.round(v * 100) / 100;
}

export type GiftCardState = 'active' | 'used' | 'expired' | 'disabled';

/** Situação para o Admin: desligado, expirado, usado (saldo 0) ou ativo. */
export function giftCardState(g: { is_active: boolean; balance: number; expires_at: string | null }, now = new Date()): GiftCardState {
  if (!g.is_active) return 'disabled';
  if (g.expires_at && new Date(g.expires_at) < now) return 'expired';
  if (Number(g.balance) <= 0) return 'used';
  return 'active';
}
