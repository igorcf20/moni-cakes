// =====================================================================================
// Carrinhos abandonados: regras puras do Admin (AdminAbandonedCarts). A lista vem de public.admin_abandoned_carts
// (migration 20261006180100_abandoned_carts.sql). Sem imports com @/ (teste em node).
// =====================================================================================

/** Opções de "parado há pelo menos" (horas) e de período (dias) da tela. */
export const IDLE_HOURS = [1, 2, 6, 24, 72] as const;
export const PERIOD_DAYS = [7, 30, 90] as const;

export const CONTACT_CHANNELS = ['whatsapp', 'email', 'phone', 'other'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

/** Link do WhatsApp com a mensagem pronta (só dígitos; sem número, sem link). */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Link de e-mail com assunto e mensagem (o próprio programa de e-mail do administrador envia). */
export function mailtoLink(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Primeiro nome para a mensagem (sem nome = vazio). */
export const firstName = (full: string | null | undefined) => String(full ?? '').trim().split(/\s+/)[0] ?? '';
