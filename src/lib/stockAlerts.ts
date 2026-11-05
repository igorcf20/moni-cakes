// =====================================================================================
// Avise-me quando chegar: regras puras usadas pelo site (StockAlertForm) e pelo Admin (AdminStockAlerts).
// O pedido entra pela função public.request_stock_alert (migration 20261006180000_stock_alerts.sql), que devolve um
// dos códigos abaixo; o texto de cada um fica em src/i18n/stockAlerts.ts (r_<código>). Sem imports com @/ (teste em node).
// =====================================================================================

export const STOCK_ALERT_RESULTS = ['ok', 'already', 'disabled', 'invalid_email', 'product_not_found', 'too_many'] as const;
export type StockAlertResult = (typeof STOCK_ALERT_RESULTS)[number];

export type StockAlertStatus = 'waiting' | 'notified' | 'cancelled';

/** Mesma regra do servidor (sem espaços, um @, domínio com ponto, até 254 caracteres). */
export function isAlertEmail(v: string): boolean {
  const s = v.trim();
  return s.length >= 3 && s.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

/** Código desconhecido vindo do servidor vira erro genérico. */
export function alertResult(v: unknown): StockAlertResult | 'error' {
  return (STOCK_ALERT_RESULTS as readonly string[]).includes(String(v)) ? (v as StockAlertResult) : 'error';
}

/** O produto voltou? (estoque sem controle = disponível) */
export const backInStock = (stock: number | null | undefined) => stock == null || stock > 0;
