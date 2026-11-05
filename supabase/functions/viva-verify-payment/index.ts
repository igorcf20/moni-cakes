import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/admin.ts";
import { ORDER_CODE_RE, UUID_RE, checkPaidTransaction, loadVivaConfig, retrieveTransaction, settlePayment, toCents } from "../_shared/viva.ts";

// Called when the customer returns from Viva Smart Checkout (Success/Failure URL).
// Body: { orderId?: string, transactionId?: string, orderCode?: string }
// The redirect query string is user-controlled, so nothing in it is trusted: the transaction is
// retrieved from Viva and must match this order's payment order code, amount and currency.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { orderId: requestedOrderId, transactionId, orderCode } = await req.json();
    if (!requestedOrderId && !orderCode) return jsonResponse({ error: "orderId or orderCode required" }, 400);
    if (requestedOrderId && !UUID_RE.test(String(requestedOrderId))) return jsonResponse({ error: "Invalid orderId" }, 400);
    if (orderCode && !ORDER_CODE_RE.test(String(orderCode))) return jsonResponse({ error: "Invalid orderCode" }, 400);
    if (transactionId && !UUID_RE.test(String(transactionId))) return jsonResponse({ error: "Invalid transactionId" }, 400);

    const sb = supabaseAdmin();
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return jsonResponse({ error: "Unauthorized" }, 401);
    const { data: userRes, error: userError } = await sb.auth.getUser(token);
    if (userError || !userRes?.user) return jsonResponse({ error: "Unauthorized" }, 401);

    let sessionQuery = sb.from("viva_payment_sessions").select("*");
    sessionQuery = orderCode
      ? sessionQuery.eq("viva_order_code", String(orderCode))
      : sessionQuery.eq("order_id", String(requestedOrderId));
    const { data: session } = await sessionQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!session) return jsonResponse({ status: "unknown" });

    const orderId = String(session.order_id);
    if (requestedOrderId && String(requestedOrderId) !== orderId) return jsonResponse({ error: "Order mismatch" }, 400);
    const { data: order } = await sb.from("orders").select("id,user_id,total,status,payment_status").eq("id", orderId).maybeSingle();
    if (!order) return jsonResponse({ error: "Order not found" }, 404);
    if (order.user_id !== userRes.user.id) {
      const { data: isAdmin } = await sb.rpc("has_role", { _user_id: userRes.user.id, _role: "admin" });
      if (!isAdmin) return jsonResponse({ error: "Forbidden" }, 403);
    }
    if (order.payment_status === "paid") return jsonResponse({ status: "paid", orderId });

    // The transaction UUID comes back as `t`; an order code is not a transaction identifier.
    const txId = String(transactionId || session.viva_transaction_id || "").trim().toLowerCase();
    if (!txId) return jsonResponse({ status: session.status || "created", orderId });

    const cfg = await loadVivaConfig(sb);
    if (!cfg) return jsonResponse({ status: session.status, orderId });
    const transaction = await retrieveTransaction(cfg, txId);
    if (!transaction) return jsonResponse({ status: session.status, orderId });

    const reason = checkPaidTransaction(transaction, session, toCents(order.total));
    if (reason) {
      if (reason !== "status_not_finished") console.warn("Viva return did not pass verification", { reason, txId });
      return jsonResponse({ status: session.status || "created", orderId });
    }

    const result = await settlePayment(sb, order, session, txId, transaction, "retorno do cliente");
    // "held" = money received but files still unverified: never tell the customer it is paid.
    return jsonResponse({ status: result === "held" ? "held" : "paid", orderId });
  } catch (error) {
    console.error("viva-verify-payment error", error);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
