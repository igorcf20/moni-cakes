import { supabaseAdmin } from "./admin.ts";
import { autoInvoiceOnPaid } from "./fiz.ts";

// Shared Viva Wallet (Smart Checkout) helpers used by the create/verify/webhook functions.
type Sb = ReturnType<typeof supabaseAdmin>;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ORDER_CODE_RE = /^\d{6,20}$/;
export const EUR = "978";

export type VivaConfig = {
  env: "demo" | "production";
  apiHost: string; accountHost: string; checkoutHost: string;
  credentials: Record<string, any>;
};

export async function loadVivaConfig(sb: Sb): Promise<VivaConfig | null> {
  const { data: creds } = await sb.from("integration_credentials").select("*").eq("provider", "viva").maybeSingle();
  const c: Record<string, any> = creds?.credentials || {};
  if (!creds?.is_active || !c.client_id || !c.client_secret) return null;
  const env = creds.environment === "production" ? "production" : "demo";
  return {
    env, credentials: c,
    apiHost: env === "production" ? "https://api.vivapayments.com" : "https://demo-api.vivapayments.com",
    accountHost: env === "production" ? "https://accounts.vivapayments.com" : "https://demo-accounts.vivapayments.com",
    checkoutHost: env === "production" ? "https://www.vivapayments.com" : "https://demo.vivapayments.com",
  };
}

export async function vivaToken(cfg: VivaConfig): Promise<string | null> {
  const { client_id, client_secret } = cfg.credentials;
  const res = await fetch(`${cfg.accountHost}/connect/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${client_id}:${client_secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) { console.error("Viva token failed", res.status, res.headers.get("x-viva-correlationid")); return null; }
  return (await res.json())?.access_token ?? null;
}

/** Retrieve Transaction. Returns null on any failure so callers can ask Viva to retry (5xx). */
export async function retrieveTransaction(cfg: VivaConfig, transactionId: string): Promise<Record<string, any> | null> {
  if (!UUID_RE.test(transactionId)) return null;
  const token = await vivaToken(cfg);
  if (!token) return null;
  const res = await fetch(`${cfg.apiHost}/checkout/v2/transactions/${encodeURIComponent(transactionId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) { console.error("Viva retrieve transaction failed", res.status, res.headers.get("x-viva-correlationid")); return null; }
  return await res.json();
}

// Retrieve Transaction returns `amount` in euros (e.g. 30.00), while orders are created in cents.
export const toCents = (amount: unknown) => Math.round(Number(amount) * 100);

/**
 * A payment counts only if Viva says it is finished (F), belongs to OUR payment order code,
 * is in EUR and covers the order total. `amount` missing/zero never passes.
 */
export function checkPaidTransaction(tx: Record<string, any>, session: { viva_order_code: string }, expectedCents: number): string | null {
  if (String(tx.statusId ?? tx.StatusId ?? "") !== "F") return "status_not_finished";
  if (String(tx.orderCode ?? tx.OrderCode ?? "") !== String(session.viva_order_code)) return "order_code_mismatch";
  const currency = String(tx.currencyCode ?? tx.CurrencyCode ?? EUR);
  if (currency !== EUR) return "currency_not_eur";
  const cents = toCents(tx.amount ?? tx.Amount);
  if (!Number.isFinite(cents) || cents <= 0 || cents < expectedCents) return "amount_too_low";
  return null;
}

export type SettleResult = "paid" | "already_paid" | "duplicate" | "held";

/**
 * Idempotent "payment confirmed" transition, safe under webhook retries and races between
 * the webhook and the customer's return page.
 */
export async function settlePayment(
  sb: Sb,
  order: { id: string; status: string | null; payment_status: string | null },
  session: { id: string },
  txId: string,
  tx: unknown,
  source: string,
): Promise<SettleResult> {
  const note = (status: string, notes: string) => sb.from("order_status_history").insert({ order_id: order.id, status, notes });
  const markSession = (status: string) => sb.from("viva_payment_sessions").update({ status, viva_transaction_id: txId, payload: tx }).eq("id", session.id);

  if (order.payment_status === "paid") {
    // Already paid: a *different* paid transaction for the same order means the customer paid twice.
    const { data: other } = await sb.from("viva_payment_sessions").select("id").eq("order_id", order.id).eq("status", "paid").neq("viva_transaction_id", txId).limit(1);
    if (other?.length) {
      await markSession("duplicate");
      await note("payment_duplicate", `Pagamento duplicado na Viva (transação ${txId}). Reembolse o valor em excesso no painel da Viva.`);
      return "duplicate";
    }
    await markSession("paid");
    return "already_paid";
  }

  // A cancelled order that still got paid must not be silently reopened.
  const update: Record<string, unknown> = { payment_status: "paid" };
  if (order.status !== "cancelled") update.status = "paid";
  const { data: changed, error } = await sb.from("orders").update(update).eq("id", order.id).neq("payment_status", "paid").select("id");
  if (error) {
    if (String(error.message).includes("order_files_pending")) {
      await markSession("paid");
      await note("payment_held", `Pagamento recebido na Viva (transação ${txId}), mas o pedido tem ficheiros por validar. Validar os ficheiros e confirmar o pagamento manualmente.`);
      return "held";
    }
    throw error;
  }
  await markSession("paid");
  if (!changed?.length) return "already_paid"; // another request confirmed it first
  await note(order.status === "cancelled" ? "payment_after_cancel" : "paid",
    order.status === "cancelled"
      ? `Pagamento recebido (transação ${txId}) num pedido cancelado. Rever ou reembolsar.`
      : `Pagamento confirmado pela Viva Wallet (transação ${txId}, ${source}).`);
  if (order.status !== "cancelled") await autoInvoiceOnPaid(sb, order.id);
  return "paid";
}

// Viva webhook source addresses (https://developer.viva.com/webhooks-for-payments/).
const VIVA_IPS = [
  "51.138.37.238", "20.54.89.16", "4.223.76.50",
  "20.50.240.57", "40.74.20.78", "195.167.87.181", "195.167.87.180", "20.13.195.185", "135.225.16.50",
];
const VIVA_CIDRS: [string, number][] = [["40.127.253.112", 28], ["51.105.129.192", 28], ["51.12.157.0", 28]];
const ipToInt = (ip: string) => ip.split(".").reduce((n, p) => (n << 8) + Number(p), 0) >>> 0;

export function isVivaIp(ip: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
  if (VIVA_IPS.includes(ip)) return true;
  return VIVA_CIDRS.some(([base, bits]) => {
    const mask = (~0 << (32 - bits)) >>> 0;
    return (ipToInt(ip) & mask) === (ipToInt(base) & mask);
  });
}
