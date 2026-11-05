import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/admin.ts";
import { UUID_RE } from "../_shared/viva.ts";
import { checkOrderPricing } from "../_shared/pricing.ts";

// Smart Checkout accent colour (hex, no #) = site primary #0057B8.
const BRAND_COLOR = "0057B8";
const MAX_SESSIONS_PER_HOUR = 6;

// Creates a Viva Wallet Smart Checkout payment order and returns the URL the client must visit.
// Body: { orderId: string }
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { orderId } = await req.json();
    if (!orderId || typeof orderId !== "string" || !UUID_RE.test(orderId)) return jsonResponse({ error: "orderId required" }, 400);

    const sb = supabaseAdmin();

    // Require an authenticated caller. The caller must either be the order's
    // owner or an admin. Guest checkout is disabled, so every order has user_id.
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return jsonResponse({ error: "Unauthorized" }, 401);
    const { data: userRes, error: uErr } = await sb.auth.getUser(token);
    if (uErr || !userRes?.user) return jsonResponse({ error: "Unauthorized" }, 401);
    const callerId = userRes.user.id;

    // Load order
    const { data: order, error: oErr } = await sb.from("orders").select("*").eq("id", orderId).maybeSingle();
    if (oErr) throw oErr;
    if (!order) return jsonResponse({ error: "Order not found" }, 404);

    if (order.user_id !== callerId) {
      const { data: isAdmin } = await sb.rpc("has_role", { _user_id: callerId, _role: "admin" });
      if (!isAdmin) return jsonResponse({ error: "Forbidden" }, 403);
    }

    // Never create a payable Viva session while any custom print files are
    // missing or still being uploaded. `files_pending` is maintained by the
    // order_items/order_designs database triggers.
    if (order.files_pending === true) {
      return jsonResponse({ error: "order_files_pending", message: "Aguarde a confirmação dos ficheiros antes de pagar." }, 409);
    }

    if (order.payment_status === "paid") return jsonResponse({ ok: true, status: "paid" });
    if (["cancelled", "refunded"].includes(String(order.status))) {
      return jsonResponse({ error: "order_not_payable", message: "Esta encomenda já não pode ser paga." }, 409);
    }

    // Reuse a recent unpaid session. This prevents duplicate Viva orders when
    // React remounts the checkout dialog or the customer retries the button.
    const reuseAfter = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    const { data: existingSession } = await sb
      .from("viva_payment_sessions")
      .select("viva_order_code, checkout_url, amount_cents, status, created_at")
      .eq("order_id", order.id)
      .eq("status", "created")
      .gte("created_at", reuseAfter)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const expectedAmountCents = Math.round(Number(order.total) * 100);
    if (existingSession?.checkout_url && Number(existingSession.amount_cents) === expectedAmountCents) {
      return jsonResponse({
        ok: true,
        status: existingSession.status,
        checkoutUrl: existingSession.checkout_url,
        orderCode: existingSession.viva_order_code,
        reused: true,
      });
    }

    // Throttle: creating Viva payment orders is not free and could be abused by a script.
    const { count: recentSessions } = await sb
      .from("viva_payment_sessions")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id)
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
    if ((recentSessions ?? 0) >= MAX_SESSIONS_PER_HOUR) {
      return jsonResponse({ error: "too_many_attempts", message: "Demasiadas tentativas de pagamento. Tente novamente dentro de uma hora." }, 429);
    }

    // Never open a payment for an order whose prices are below what the catalogue allows.
    const pricing = await checkOrderPricing(sb, order);
    if (!pricing.ok) {
      console.warn("Order failed price check", { orderId: order.id, reason: pricing.reason });
      const { data: already } = await sb.from("order_status_history").select("id").eq("order_id", order.id).eq("status", "price_check_failed").limit(1);
      if (!already?.length) await sb.from("order_status_history").insert({
        order_id: order.id, status: "price_check_failed",
        notes: `Pagamento bloqueado: ${pricing.reason} (total ${Number(order.total).toFixed(2)} €). Rever a encomenda.`,
      });
      return jsonResponse({ error: "order_price_check_failed", message: "Não foi possível validar os preços desta encomenda. Contacte-nos para a concluir." }, 409);
    }

    // Load Viva credentials
    const { data: creds } = await sb.from("integration_credentials").select("*").eq("provider", "viva").maybeSingle();
    if (!creds || !creds.is_active) return jsonResponse({ error: "Viva Wallet not configured/active" }, 503);
    const c: any = creds.credentials || {};
    const env = creds.environment === "production" ? "production" : "demo";
    const apiHost = env === "production" ? "https://api.vivapayments.com" : "https://demo-api.vivapayments.com";
    const accountHost = env === "production" ? "https://accounts.vivapayments.com" : "https://demo-accounts.vivapayments.com";
    const checkoutHost = env === "production" ? "https://www.vivapayments.com" : "https://demo.vivapayments.com";
    if (!c.client_id || !c.client_secret || !c.source_code) {
      return jsonResponse({ error: "Missing Viva credentials (client_id / client_secret / source_code)" }, 503);
    }

    // 1. OAuth2 token
    const basic = btoa(`${c.client_id}:${c.client_secret}`);
    const tokRes = await fetch(`${accountHost}/connect/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    if (!tokRes.ok) {
      const txt = await tokRes.text();
      console.error("Viva token error", txt);
      return jsonResponse({ error: "Viva auth failed" }, 502);
    }
    const tok = await tokRes.json();

    // 2. Create payment order
    const amountCents = expectedAmountCents;
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return jsonResponse({ error: "Order total must be greater than zero" }, 400);
    }
    const customer = {
      email: order.guest_email || (order.user_id === callerId ? userRes.user.email : undefined) || undefined,
      fullName: order.guest_name || (order.shipping_address as any)?.name || undefined,
      phone: order.guest_phone || undefined,
      countryCode: "PT",
      requestLang: "pt-PT",
    };
    const payload = {
      amount: amountCents,
      customerTrns: `Encomenda #${order.id.slice(0, 8)}`,
      customer,
      paymentTimeout: 1800,
      preauth: false,
      allowRecurring: false,
      maxInstallments: 0,
      paymentNotification: true,
      tipAmount: 0,
      sourceCode: c.source_code,
      merchantTrns: order.id,
      tags: [order.id],
    };
    const orderRes = await fetch(`${apiHost}/checkout/v2/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!orderRes.ok) {
      const txt = await orderRes.text();
      console.error("Viva order error", txt);
      return jsonResponse({ error: "Viva order creation failed" }, 502);
    }
    const orderData = await orderRes.json();
    const vivaOrderCode = String(orderData.orderCode);
    const checkoutUrl = `${checkoutHost}/web/checkout?ref=${vivaOrderCode}&color=${BRAND_COLOR}`;

    const { error: sessionError } = await sb.from("viva_payment_sessions").insert({
      order_id: order.id,
      viva_order_code: vivaOrderCode,
      amount_cents: amountCents,
      status: "created",
      checkout_url: checkoutUrl,
      payload: orderData,
    });
    if (sessionError) throw sessionError;

    return jsonResponse({
      ok: true,
      checkoutUrl,
      orderCode: vivaOrderCode,
      merchantId: c.merchant_id || null,
      environment: env,
      sourceCode: c.source_code,
    });
  } catch (e) {
    console.error("viva-create-order error", e);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
