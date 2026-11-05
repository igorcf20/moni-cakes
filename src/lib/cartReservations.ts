// Reserva no carrinho (recurso cart_reservations): regras em store_settings.cart_reservations.
// Mesma normalização do servidor (_cart_reservation_rules na migration 20261007220000_cart_reservations.sql).
// Sem imports com @/ para o teste em node (scripts/test-cart-stock.mjs).

export type CartReservationSettings = {
  /** Minutos que as unidades ficam reservadas (1 a 240). */
  minutes: number;
  /** O cliente vê o tempo restante e o aviso quando a reserva acaba. */
  notice: boolean;
  /** Mudar a quantidade recomeça a contagem (senão só a reserva nova tem prazo novo). */
  restart_on_change: boolean;
};

export const DEFAULT_CART_RESERVATIONS: CartReservationSettings = { minutes: 5, notice: true, restart_on_change: true };
export const RESERVATION_MINUTES_MAX = 240;

export function normalizeCartReservations(value: unknown): CartReservationSettings {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const m = typeof v.minutes === 'number' && Number.isFinite(v.minutes) ? Math.floor(v.minutes) : DEFAULT_CART_RESERVATIONS.minutes;
  return {
    minutes: Math.min(RESERVATION_MINUTES_MAX, Math.max(1, m)),
    notice: typeof v.notice === 'boolean' ? v.notice : true,
    restart_on_change: typeof v.restart_on_change === 'boolean' ? v.restart_on_change : true,
  };
}

/** Quem tem a reserva: conta ('u:') ou carrinho de visitante ('g:'). */
export const isGuestHolder = (holder: string) => holder.startsWith('g:');
