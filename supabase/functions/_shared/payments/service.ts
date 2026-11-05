// Abrir e confirmar pagamentos online (Mercado Pago, Stripe, PayPal) para um pedido.
// startPayment: cria o pagamento no provedor com o total do pedido (calculado no servidor) e grava a sessão.
// verifyOrderPayment: pergunta ao provedor o estado e, se o pagamento cobre a sessão, marca o pedido como pago
// (idempotente: o retorno do cliente e o webhook podem chegar ao mesmo tempo).
// Moeda: o pedido está na moeda base da loja; se a conta cobra noutra moeda (Mercado Pago só em reais), o valor
// é convertido com as taxas de Configurações e o valor convertido fica gravado na sessão.
import { autoInvoiceOnPaid } from "../fiz.ts";
import { checkOrderPricing } from "../pricing.ts";
import { convertCents } from "../shipping/rules.ts";
import { GATEWAYS, rejectPayment, type GatewayAccount } from "./gateways.ts";
import { currencyDigits, isGatewayMethod, toMinor } from "./methods.ts";

type Sb = any;
const MAX_SESSIONS_PER_HOUR = 6;
const REUSE_MINUTES = 25;

export type StartResult =
  | { ok: true; url: string; reused?: boolean }
  | { ok: true; status: "paid" }
  | { ok: false; code: string; status: number };

export async function loadAccount(sb: Sb, provider: string): Promise<GatewayAccount | null> {
  const { data } = await sb.from("integration_credentials").select("environment,is_active,credentials,public_config").eq("provider", provider).maybeSingle();
  const gw = GATEWAYS[provider];
  if (!data?.is_active || !gw) return null;
  const credentials = (data.credentials ?? {}) as Record<string, any>;
  if (gw.required.some((k) => !String(credentials[k] ?? "").trim())) return null;
  return { environment: data.environment ?? "demo", credentials, public_config: (data.public_config ?? {}) as Record<string, any> };
}

async function storeSettings(sb: Sb) {
  const { data } = await sb.from("store_settings").select("key,value").in("key", ["currency_settings", "store_info"]);
  const get = (k: string) => (data ?? []).find((r: any) => r.key === k)?.value ?? {};
  const fx: any = get("currency_settings");
  const info: any = get("store_info");
  return {
    base: String(fx.default || "BRL").toUpperCase(),
    rates: (fx.rates ?? {}) as Record<string, number>,
    storeName: String(info.name || Deno.env.get("STORE_NAME") || "Loja").slice(0, 60),
  };
}

const siteBase = () => String(Deno.env.get("SITE_URL") || "").replace(/\/+$/, "");
const apiBase = () => String(Deno.env.get("SUPABASE_PUBLIC_URL") || Deno.env.get("SITE_URL") || "").replace(/\/+$/, "");

export async function startPayment(sb: Sb, order: any, customer: { email?: string | null; locale?: string | null }): Promise<StartResult> {
  const provider = String(order.payment_method ?? "");
  if (!isGatewayMethod(provider)) return { ok: false, code: "not_online_payment", status: 400 };
  if (order.payment_status === "paid") return { ok: true, status: "paid" };
  if (["cancelled", "refunded"].includes(String(order.status))) return { ok: false, code: "order_not_payable", status: 409 };
  // Ficheiros de personalização ainda por confirmar: o pagamento só abre depois (como na Viva).
  if (order.files_pending === true) return { ok: false, code: "order_files_pending", status: 409 };

  const { data: method } = await sb.from("payment_config").select("type,is_active").eq("type", provider).maybeSingle();
  if (!method?.is_active) return { ok: false, code: "method_disabled", status: 409 };
  const account = await loadAccount(sb, provider);
  if (!account) return { ok: false, code: "provider_not_configured", status: 503 };
  const gw = GATEWAYS[provider];

  const settings = await storeSettings(sb);
  const currency = gw.currency(account, settings.base);
  const baseMinor = toMinor(Number(order.total), settings.base);
  const amountMinor = convertCents(baseMinor, settings.base, currency, settings.rates, settings.base, currencyDigits);
  if (amountMinor == null) return { ok: false, code: "currency_rate_missing", status: 503 };
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) return { ok: false, code: "order_total_invalid", status: 409 };

  // Reaproveita um pagamento recente do mesmo valor (o cliente voltou atrás ou carregou duas vezes).
  const { data: recent } = await sb.from("payment_sessions").select("checkout_url,amount_cents,currency,status,created_at")
    .eq("order_id", order.id).eq("provider", provider).eq("status", "created")
    .gte("created_at", new Date(Date.now() - REUSE_MINUTES * 60_000).toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (recent?.checkout_url && Number(recent.amount_cents) === amountMinor && recent.currency === currency) {
    return { ok: true, url: recent.checkout_url, reused: true };
  }

  const { count } = await sb.from("payment_sessions").select("id", { count: "exact", head: true })
    .eq("order_id", order.id).gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= MAX_SESSIONS_PER_HOUR) return { ok: false, code: "too_many_attempts", status: 429 };

  // Nunca abrir pagamento de um pedido com preços abaixo do catálogo.
  const pricing = await checkOrderPricing(sb, order);
  if (!pricing.ok) {
    console.warn("payment-start price check failed", { orderId: order.id, reason: pricing.reason });
    await sb.from("order_status_history").insert({ order_id: order.id, status: "price_check_failed", notes: `Pagamento bloqueado: ${pricing.reason}` });
    return { ok: false, code: "order_price_check_failed", status: 409 };
  }

  const short = String(order.id).slice(0, 8).toUpperCase();
  const site = siteBase();
  const back = `${site}/pedido/${order.id}/sucesso`;
  const created = await gw.create(account, {
    orderId: order.id,
    amountMinor,
    currency,
    description: `${settings.storeName} #${short}`,
    storeName: settings.storeName,
    email: customer.email ?? order.guest_email ?? null,
    name: order.guest_name ?? null,
    locale: customer.locale ?? null,
    returnUrl: `${back}?pagamento=retorno`,
    cancelUrl: `${back}?pagamento=cancelado`,
    notifyUrl: `${apiBase()}/functions/v1/payment-webhook?provider=${provider}`,
  });
  const { error } = await sb.from("payment_sessions").insert({
    order_id: order.id, provider, provider_ref: created.ref, checkout_url: created.url,
    amount_cents: amountMinor, currency, status: "created", payload: created.raw,
  });
  if (error) throw error;
  return { ok: true, url: created.url };
}

export type VerifyResult = "paid" | "held" | "pending" | "failed" | "unknown";

/** Confirma no provedor o pagamento do pedido (sessões abertas mais recentes primeiro). */
export async function verifyOrderPayment(sb: Sb, orderId: string, source: string): Promise<VerifyResult> {
  const { data: order } = await sb.from("orders").select("id,status,payment_status,payment_method").eq("id", orderId).maybeSingle();
  if (!order) return "unknown";
  const provider = String(order.payment_method ?? "");
  if (!isGatewayMethod(provider)) return "unknown";
  if (order.payment_status === "paid") return "paid";

  const { data: sessions } = await sb.from("payment_sessions").select("*")
    .eq("order_id", orderId).eq("provider", provider).in("status", ["created", "failed", "expired"])
    .order("created_at", { ascending: false }).limit(5);
  if (!sessions?.length) return "unknown";
  const account = await loadAccount(sb, provider);
  if (!account) return "pending";
  const gw = GATEWAYS[provider];

  let anyPending = false;
  // Mercado Pago procura por pedido (uma consulta basta); Stripe e PayPal consultam cada sessão.
  const toCheck = provider === "mercado_pago" ? sessions.slice(0, 1) : sessions;
  for (const session of toCheck) {
    const state = await gw.check(account, session.provider_ref, orderId);
    if (!state) continue;
    // No Mercado Pago o pagamento pode ter vindo de qualquer tentativa: vale contra a sessão do mesmo valor.
    const target = provider === "mercado_pago"
      ? sessions.find((s: any) => !rejectPayment(state, s, orderId)) ?? session
      : session;
    const reason = rejectPayment(state, target, orderId);
    if (!reason) {
      const result = await settle(sb, order, target, state.paymentId ?? target.provider_ref, state.raw, `${provider}, ${source}`);
      return result === "held" ? "held" : "paid";
    }
    if (state.status === "pending") anyPending = true;
    else if (state.status === "paid") console.warn("payment verify rejected", { orderId, provider, reason });
    else if (state.status === "failed" && target.status === "created") {
      await sb.from("payment_sessions").update({ status: "failed", payload: state.raw }).eq("id", target.id);
    }
  }
  return anyPending ? "pending" : "failed";
}

const NAMES: Record<string, string> = { mercado_pago: "Mercado Pago", stripe: "Stripe", paypal: "PayPal" };

/** Passagem idempotente para "pago" (mesma lógica da Viva, para as sessões em payment_sessions). */
async function settle(sb: Sb, order: any, session: any, paymentId: string, raw: unknown, source: string): Promise<"paid" | "already_paid" | "duplicate" | "held"> {
  const name = NAMES[session.provider] ?? session.provider;
  const note = (status: string, notes: string) => sb.from("order_status_history").insert({ order_id: order.id, status, notes });
  const mark = (status: string) => sb.from("payment_sessions").update({ status, provider_payment_id: paymentId, payload: raw }).eq("id", session.id);

  if (order.payment_status === "paid") {
    const { data: other } = await sb.from("payment_sessions").select("id").eq("order_id", order.id).eq("status", "paid").neq("provider_payment_id", paymentId).limit(1);
    if (other?.length) {
      await mark("duplicate");
      await note("payment_duplicate", `Pagamento duplicado no ${name} (${paymentId}). Reembolse o valor em excesso no painel do ${name}.`);
      return "duplicate";
    }
    await mark("paid");
    return "already_paid";
  }

  const update: Record<string, unknown> = { payment_status: "paid", paid_at: new Date().toISOString() };
  if (order.status !== "cancelled") update.status = "paid";
  const { data: changed, error } = await sb.from("orders").update(update).eq("id", order.id).neq("payment_status", "paid").select("id");
  if (error) {
    if (String(error.message).includes("order_files_pending")) {
      await mark("held");
      await note("payment_held", `Pagamento recebido no ${name} (${paymentId}), mas o pedido tem ficheiros por validar. Validar os ficheiros e confirmar o pagamento manualmente.`);
      return "held";
    }
    throw error;
  }
  await mark("paid");
  if (!changed?.length) return "already_paid";
  await note(order.status === "cancelled" ? "payment_after_cancel" : "paid",
    order.status === "cancelled"
      ? `Pagamento recebido no ${name} (${paymentId}) num pedido cancelado. Rever ou reembolsar.`
      : `Pagamento confirmado pelo ${name} (${paymentId}, ${source}).`);
  if (order.status !== "cancelled") await autoInvoiceOnPaid(sb, order.id);
  return "paid";
}
