import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/admin.ts";
import { loadAccount, verifyOrderPayment } from "../_shared/payments/service.ts";
import { mercadoPagoOrderOf } from "../_shared/payments/gateways.ts";

// Avisos de pagamento do Mercado Pago, Stripe e PayPal: /functions/v1/payment-webhook?provider=<nome>.
// O aviso só diz QUAL pagamento mudou; o estado é sempre confirmado na API do provedor (verifyOrderPayment),
// por isso um aviso falso não marca nada como pago. Responde 200 aos avisos ignorados e 500 só a falhas
// passageiras (o provedor volta a tentar).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = (extra: Record<string, unknown> = {}) => jsonResponse({ ok: true, ...extra });

serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  if (Number(req.headers.get("content-length") || 0) > 256_000) return jsonResponse({ error: "payload_too_large" }, 413);
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") ?? "";
  const sb = supabaseAdmin();
  try {
    const event: any = await req.json().catch(() => ({}));
    let orderId: string | null = null;

    if (provider === "mercado_pago") {
      // { type: "payment", data: { id } } ou, no formato antigo, ?topic=payment&id=...
      const kind = String(event?.type ?? event?.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "");
      if (kind !== "payment") return ok({ ignored: kind || "no_type" });
      const paymentId = String(event?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
      const account = await loadAccount(sb, "mercado_pago");
      if (!account) return ok({ ignored: "not_configured" });
      orderId = await mercadoPagoOrderOf(account, paymentId);
    } else if (provider === "stripe") {
      const obj = event?.data?.object ?? {};
      const ref = obj?.object === "checkout.session" ? String(obj.id ?? "") : "";
      if (!ref) return ok({ ignored: String(event?.type ?? "no_session") });
      const { data: s } = await sb.from("payment_sessions").select("order_id").eq("provider", "stripe").eq("provider_ref", ref).maybeSingle();
      orderId = s?.order_id ?? null;
    } else if (provider === "paypal") {
      const res = event?.resource ?? {};
      const ref = String(res?.supplementary_data?.related_ids?.order_id ?? (String(event?.event_type ?? "").startsWith("CHECKOUT.ORDER") ? res?.id : "") ?? "");
      if (!ref) return ok({ ignored: String(event?.event_type ?? "no_order") });
      const { data: s } = await sb.from("payment_sessions").select("order_id").eq("provider", "paypal").eq("provider_ref", ref).maybeSingle();
      orderId = s?.order_id ?? null;
    } else {
      return jsonResponse({ error: "unknown_provider" }, 400);
    }

    if (!orderId || !UUID_RE.test(orderId)) return ok({ ignored: "unknown_order" });
    const status = await verifyOrderPayment(sb, orderId, "aviso do provedor");
    return ok({ status });
  } catch (error) {
    console.error("payment-webhook error", provider, (error as Error)?.message ?? error);
    return jsonResponse({ error: "temporary_failure" }, 500);
  }
});
