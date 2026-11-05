import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/admin.ts";
import { startPayment } from "../_shared/payments/service.ts";

// Abre o pagamento online do pedido (Mercado Pago, Stripe ou PayPal, conforme o meio escolhido no checkout)
// e devolve o endereço para onde o cliente vai pagar. O valor é sempre o total gravado no pedido.
// Body: { orderId, locale? }. Só o dono do pedido (ou um admin) pode abrir o pagamento.
// Erros com código estável (o site traduz): not_online_payment, order_not_payable, order_files_pending,
// method_disabled, provider_not_configured, currency_rate_missing, too_many_attempts, order_price_check_failed.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => null);
    const orderId = String(body?.orderId ?? "");
    if (!UUID_RE.test(orderId)) return jsonResponse({ error: "order_id_required" }, 400);

    const sb = supabaseAdmin();
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const { data: auth } = token ? await sb.auth.getUser(token) : { data: null };
    const user = auth?.user;
    if (!user) return jsonResponse({ error: "unauthorized" }, 401);

    const { data: order } = await sb.from("orders").select("*").eq("id", orderId).maybeSingle();
    if (!order) return jsonResponse({ error: "order_not_found" }, 404);
    if (order.user_id !== user.id) {
      const { data: isAdmin } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (!isAdmin) return jsonResponse({ error: "forbidden" }, 403);
    }

    const locale = typeof body?.locale === "string" ? body.locale.slice(0, 10) : null;
    const result = await startPayment(sb, order, { email: order.user_id === user.id ? user.email : null, locale });
    if (!result.ok) return jsonResponse({ error: result.code }, result.status);
    return jsonResponse(result);
  } catch (error) {
    console.error("payment-start error", (error as Error)?.message ?? error);
    return jsonResponse({ error: "provider_error" }, 502);
  }
});
