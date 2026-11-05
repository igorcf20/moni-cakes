import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/admin.ts";
import { verifyOrderPayment } from "../_shared/payments/service.ts";

// Chamada quando o cliente volta do Mercado Pago, Stripe ou PayPal (e pelo botão "Já paguei").
// Nada do endereço de retorno é aceite como prova: o estado vem da API do provedor.
// Body: { orderId }. Resposta: { status: paid | held | pending | failed | unknown }.
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

    const { data: order } = await sb.from("orders").select("id,user_id").eq("id", orderId).maybeSingle();
    if (!order) return jsonResponse({ error: "order_not_found" }, 404);
    if (order.user_id !== user.id) {
      const { data: isAdmin } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (!isAdmin) return jsonResponse({ error: "forbidden" }, 403);
    }
    const status = await verifyOrderPayment(sb, orderId, "retorno do cliente");
    return jsonResponse({ status, orderId });
  } catch (error) {
    console.error("payment-verify error", (error as Error)?.message ?? error);
    return jsonResponse({ status: "pending", error: "provider_error" });
  }
});
