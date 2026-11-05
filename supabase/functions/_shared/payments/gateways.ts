// Provedores de pagamento online: Mercado Pago (Checkout Pro), Stripe (Checkout) e PayPal (Orders v2).
// Cada provedor sabe abrir um pagamento (create) e dizer, consultando a SUA API, se está pago (check).
// Nada do que vem do navegador ou de um webhook é aceite como prova: o servidor pergunta sempre ao provedor
// e compara referência (id do pedido), moeda e valor com o que foi gravado em payment_sessions.
// Chaves: Admin > Integrações (tabela integration_credentials, nunca no código).
// Provedor novo = uma entrada em GATEWAYS + o tipo em payment_config/payment_sessions + chaves no admin-credentials.
import { currencyDigits, fromMinor, toMinor } from "./methods.ts";

export type GatewayAccount = {
  environment: string | null;
  credentials: Record<string, any>;
  public_config: Record<string, any>;
};
export type CheckoutInput = {
  orderId: string;
  amountMinor: number;
  currency: string;
  description: string;
  storeName: string;
  email?: string | null;
  name?: string | null;
  locale?: string | null;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
};
export type CheckoutResult = { ref: string; url: string; raw: unknown };
export type PaymentState = {
  status: "paid" | "pending" | "failed";
  amountMinor: number;
  currency: string;
  reference: string | null; // id do pedido gravado no provedor
  paymentId: string | null;
  raw: unknown;
};
export type Gateway = {
  /** Moeda em que a conta cobra (Mercado Pago: a do país da conta). null = a moeda base da loja. */
  currency(account: GatewayAccount, base: string): string;
  create(account: GatewayAccount, input: CheckoutInput): Promise<CheckoutResult>;
  /** Estado atual do pagamento aberto em `ref` (o PayPal captura aqui um pagamento aprovado). */
  check(account: GatewayAccount, ref: string, orderId: string): Promise<PaymentState | null>;
  /** Credenciais obrigatórias (para o Admin e para recusar abrir pagamentos sem conta). */
  required: string[];
};

const TIMEOUT_MS = 15_000;
async function call(url: string, init: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
  if (!res.ok) {
    const detail = body?.message || body?.error?.message || body?.error_description || body?.name || res.statusText;
    throw new Error(`HTTP ${res.status}: ${String(detail).slice(0, 200)}`);
  }
  return body;
}
const upper = (v: unknown) => String(v ?? "").toUpperCase();
const decimal = (minor: number, currency: string) => fromMinor(minor, currency).toFixed(currencyDigits(currency));

// ── Mercado Pago (Checkout Pro: Pix, cartão, boleto, saldo) ───────────────────────────────────────────
// https://www.mercadopago.com.br/developers/pt/reference/preferences/_checkout_preferences/post
// Credenciais de teste (TEST-...) e de produção usam o mesmo endereço; a conta decide o modo.
const MP_API = "https://api.mercadopago.com";
const mercadoPago: Gateway = {
  required: ["access_token"],
  currency: (acc) => upper(acc.public_config?.currency || "BRL"),
  async create(acc, input) {
    const installments = Math.min(24, Math.max(1, Number(acc.public_config?.max_installments) || 12));
    const body = {
      items: [{ id: input.orderId, title: input.description, quantity: 1, unit_price: Number(decimal(input.amountMinor, input.currency)), currency_id: input.currency }],
      payer: { email: input.email || undefined, name: input.name || undefined },
      external_reference: input.orderId,
      back_urls: { success: input.returnUrl, pending: input.returnUrl, failure: input.cancelUrl },
      auto_return: "approved",
      notification_url: input.notifyUrl,
      statement_descriptor: String(acc.public_config?.statement_descriptor || input.storeName).replace(/[^A-Za-z0-9 ]/g, "").slice(0, 13) || undefined,
      payment_methods: { installments },
      metadata: { order_id: input.orderId },
    };
    const data = await call(`${MP_API}/checkout/preferences`, {
      method: "POST",
      headers: { Authorization: `Bearer ${acc.credentials.access_token}`, "Content-Type": "application/json", "X-Idempotency-Key": `pref-${input.orderId}-${input.amountMinor}-${Date.now()}` },
      body: JSON.stringify(body),
    });
    const url = data?.init_point || data?.sandbox_init_point;
    if (!data?.id || !url) throw new Error("Mercado Pago: resposta sem link de pagamento.");
    return { ref: String(data.id), url: String(url), raw: { id: data.id } };
  },
  // Um pedido pode ter várias tentativas (Pix expirado, cartão recusado): procura todos os pagamentos com a
  // referência do pedido e usa o aprovado, se houver.
  async check(acc, _ref, orderId) {
    const data = await call(`${MP_API}/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc&limit=20`, {
      headers: { Authorization: `Bearer ${acc.credentials.access_token}` },
    });
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    const mine = results.filter((p) => String(p?.external_reference ?? "") === orderId);
    if (!mine.length) return null;
    const pick = mine.find((p) => p.status === "approved")
      ?? mine.find((p) => ["pending", "in_process", "authorized"].includes(p.status))
      ?? mine[0];
    const currency = upper(pick.currency_id);
    const status = pick.status === "approved" ? "paid" : ["pending", "in_process", "authorized"].includes(pick.status) ? "pending" : "failed";
    return { status, amountMinor: toMinor(Number(pick.transaction_amount) || 0, currency || "BRL"), currency, reference: String(pick.external_reference ?? ""), paymentId: pick.id != null ? String(pick.id) : null, raw: { id: pick.id, status: pick.status, status_detail: pick.status_detail, payment_type_id: pick.payment_type_id } };
  },
};

/** Webhook do Mercado Pago: só traz o id do pagamento; a referência do pedido vem da API. */
export async function mercadoPagoOrderOf(acc: GatewayAccount, paymentId: string): Promise<string | null> {
  if (!/^\d{1,20}$/.test(paymentId)) return null;
  const data = await call(`${MP_API}/v1/payments/${paymentId}`, { headers: { Authorization: `Bearer ${acc.credentials.access_token}` } });
  return data?.external_reference ? String(data.external_reference) : null;
}

// ── Stripe (Checkout: cartão, Apple Pay, Google Pay e os meios locais ligados no painel do Stripe,
//    como MB WAY, Multibanco, SEPA, iDEAL, Bancontact) ─────────────────────────────────────────────────
// https://docs.stripe.com/api/checkout/sessions/create . Chave secreta sk_test_ (teste) ou sk_live_ (produção).
const STRIPE_API = "https://api.stripe.com/v1";
const form = (obj: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v != null && v !== "") p.append(k, String(v));
  return p.toString();
};
const STRIPE_LOCALES = new Set(["pt-BR", "pt", "es", "en", "fr", "de", "it"]);
const stripe: Gateway = {
  required: ["secret_key"],
  currency: (_acc, base) => base,
  async create(acc, input) {
    const locale = input.locale && STRIPE_LOCALES.has(input.locale) ? input.locale : input.locale?.startsWith("pt") ? "pt" : "auto";
    const data = await call(`${STRIPE_API}/checkout/sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${acc.credentials.secret_key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form({
        mode: "payment",
        success_url: input.returnUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.orderId,
        customer_email: input.email,
        locale,
        "metadata[order_id]": input.orderId,
        "payment_intent_data[metadata][order_id]": input.orderId,
        "line_items[0][quantity]": 1,
        "line_items[0][price_data][currency]": input.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": input.amountMinor,
        "line_items[0][price_data][product_data][name]": input.description,
      }),
    });
    if (!data?.id || !data?.url) throw new Error("Stripe: resposta sem link de pagamento.");
    return { ref: String(data.id), url: String(data.url), raw: { id: data.id } };
  },
  async check(acc, ref) {
    if (!/^cs_[A-Za-z0-9_]+$/.test(ref)) return null;
    const s = await call(`${STRIPE_API}/checkout/sessions/${ref}`, { headers: { Authorization: `Bearer ${acc.credentials.secret_key}` } });
    const currency = upper(s?.currency);
    // payment_status "paid" só depois de o dinheiro estar garantido (Multibanco e SEPA ficam "unpaid" até lá).
    const status = s?.payment_status === "paid" ? "paid" : s?.status === "expired" ? "failed" : "pending";
    return { status, amountMinor: Number(s?.amount_total) || 0, currency, reference: s?.client_reference_id ?? s?.metadata?.order_id ?? null, paymentId: s?.payment_intent ? String(s.payment_intent) : null, raw: { id: s?.id, status: s?.status, payment_status: s?.payment_status } };
  },
};

// ── PayPal (Orders v2: conta PayPal e cartão pelo PayPal) ───────────────────────────────────────────────
// https://developer.paypal.com/docs/api/orders/v2/ . Ambiente demo = sandbox.
const paypalBase = (acc: GatewayAccount) => acc.environment === "production" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
async function paypalToken(acc: GatewayAccount): Promise<string> {
  const data = await call(`${paypalBase(acc)}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${acc.credentials.client_id}:${acc.credentials.client_secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!data?.access_token) throw new Error("PayPal: sem token de acesso.");
  return String(data.access_token);
}
function paypalState(order: any): PaymentState {
  const unit = order?.purchase_units?.[0] ?? {};
  const captures: any[] = unit?.payments?.captures ?? [];
  const done = captures.find((c) => c?.status === "COMPLETED");
  const pending = captures.find((c) => c?.status === "PENDING");
  const cap = done ?? pending ?? captures[0];
  const currency = upper(cap?.amount?.currency_code ?? unit?.amount?.currency_code);
  const value = Number(cap?.amount?.value ?? 0);
  const status = done ? "paid" : pending || ["CREATED", "SAVED", "APPROVED", "PAYER_ACTION_REQUIRED"].includes(order?.status) ? "pending" : "failed";
  return { status, amountMinor: done || pending ? toMinor(value, currency || "USD") : 0, currency, reference: unit?.custom_id ?? unit?.reference_id ?? null, paymentId: cap?.id ? String(cap.id) : null, raw: { id: order?.id, status: order?.status, capture: cap?.status ?? null } };
}
const paypal: Gateway = {
  required: ["client_id", "client_secret"],
  currency: (_acc, base) => base,
  async create(acc, input) {
    const token = await paypalToken(acc);
    const data = await call(`${paypalBase(acc)}/v2/checkout/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": `create-${input.orderId}-${input.amountMinor}-${Date.now()}` },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ reference_id: input.orderId, custom_id: input.orderId, description: input.description.slice(0, 127), amount: { currency_code: input.currency, value: decimal(input.amountMinor, input.currency) } }],
        payment_source: { paypal: { experience_context: {
          brand_name: input.storeName.slice(0, 127), user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING",
          return_url: input.returnUrl, cancel_url: input.cancelUrl,
        } } },
      }),
    });
    const link = (data?.links ?? []).find((l: any) => l?.rel === "payer-action" || l?.rel === "approve");
    if (!data?.id || !link?.href) throw new Error("PayPal: resposta sem link de pagamento.");
    return { ref: String(data.id), url: String(link.href), raw: { id: data.id, status: data.status } };
  },
  async check(acc, ref) {
    if (!/^[A-Z0-9]{8,40}$/.test(ref)) return null;
    const token = await paypalToken(acc);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    let order = await call(`${paypalBase(acc)}/v2/checkout/orders/${ref}`, { headers });
    // Aprovado pelo cliente mas ainda não cobrado: o servidor captura (uma só vez, mesmo com pedidos repetidos).
    if (order?.status === "APPROVED") {
      order = await call(`${paypalBase(acc)}/v2/checkout/orders/${ref}/capture`, {
        method: "POST", headers: { ...headers, "PayPal-Request-Id": `capture-${ref}`, Prefer: "return=representation" }, body: "{}",
      });
    }
    return paypalState(order);
  },
};

export const GATEWAYS: Record<string, Gateway> = { mercado_pago: mercadoPago, stripe, paypal };

/**
 * O pagamento cobre a sessão? Pago, mesma referência (id do pedido), mesma moeda e valor não inferior.
 * Devolve o motivo da recusa, ou null quando vale.
 */
export function rejectPayment(state: PaymentState, session: { amount_cents: number | string; currency: string }, orderId: string): string | null {
  if (state.status !== "paid") return `status_${state.status}`;
  if (String(state.reference ?? "") !== orderId) return "reference_mismatch";
  if (upper(state.currency) !== upper(session.currency)) return "currency_mismatch";
  const expected = Number(session.amount_cents);
  if (!Number.isFinite(state.amountMinor) || state.amountMinor <= 0 || state.amountMinor < expected) return "amount_too_low";
  return null;
}
