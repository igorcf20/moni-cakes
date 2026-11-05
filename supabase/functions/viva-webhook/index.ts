import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/admin.ts";
import { ORDER_CODE_RE, UUID_RE, checkPaidTransaction, isVivaIp, loadVivaConfig, retrieveTransaction, settlePayment, toCents } from "../_shared/viva.ts";

const firstText = (...values: unknown[]) => String(values.find((value) => value !== undefined && value !== null) ?? "").trim();
const ok = (extra: Record<string, unknown> = {}) => jsonResponse({ ok: true, ...extra });

// Viva retries any non-2xx (hourly, up to 24x): answer 2xx for events we deliberately ignore
// (unknown order, unverified, informational) and 5xx only for transient failures worth retrying.
//
// GET returns the verification key Viva asks for when registering the webhook.
// POST receives payment events. The payload is NEVER trusted: every state change is confirmed
// with the Retrieve Transaction API (orderCode + statusId + amount + currency).
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = supabaseAdmin();

  if (req.method === "GET") {
    const { data: creds } = await sb.from("integration_credentials").select("credentials").eq("provider", "viva").maybeSingle();
    const key = (creds?.credentials as any)?.webhook_key;
    return key ? jsonResponse({ Key: key }) : jsonResponse({ error: "Webhook key not configured" }, 503);
  }
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  // Defence in depth: Viva publishes its source IPs. Off by default (payloads are re-verified with
  // the API anyway); set VIVA_WEBHOOK_STRICT_IP=true in the function secrets to reject other sources.
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (ip && !isVivaIp(ip)) {
    console.warn("viva-webhook from non-Viva IP", ip);
    if (Deno.env.get("VIVA_WEBHOOK_STRICT_IP") === "true") return jsonResponse({ error: "Forbidden" }, 403);
  }
  if (Number(req.headers.get("content-length") || 0) > 64_000) return jsonResponse({ error: "Payload too large" }, 413);

  try {
    const event = await req.json();
    const data = event?.EventData ?? event?.eventData ?? event ?? {};
    const eventTypeId = Number(event?.EventTypeId ?? event?.eventTypeId ?? 0);
    const orderCode = firstText(data?.OrderCode, data?.orderCode);
    const merchantTrns = firstText(data?.MerchantTrns, data?.merchantTrns);
    const transactionId = firstText(data?.TransactionId, data?.transactionId, data?.Id, data?.id).toLowerCase();

    // 1796 = payment created, 1797 = reversal/refund, 1798 = failed, 4865 = order updated.
    // 1799 (price calculated) and anything else are informational.
    if (![1796, 1797, 1798, 4865].includes(eventTypeId)) return ok({ ignored: "unsupported_event" });

    let sessionQuery = sb.from("viva_payment_sessions").select("*");
    if (ORDER_CODE_RE.test(orderCode)) sessionQuery = sessionQuery.eq("viva_order_code", orderCode);
    else if (UUID_RE.test(merchantTrns)) sessionQuery = sessionQuery.eq("order_id", merchantTrns);
    else return ok({ ignored: "missing_order_reference" });
    const { data: session } = await sessionQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!session) return ok({ ignored: "session_not_found" });

    const orderId = String(session.order_id);
    if (UUID_RE.test(merchantTrns) && merchantTrns !== orderId) {
      console.warn("Viva webhook merchantTrns mismatch", { merchantTrns, orderId });
      return ok({ ignored: "order_mismatch" });
    }
    const { data: order } = await sb.from("orders").select("id,total,status,payment_status").eq("id", orderId).maybeSingle();
    if (!order) return ok({ ignored: "order_not_found" });

    // 4865: only closes an unused payment session; it never touches the order.
    if (eventTypeId === 4865) {
      if (session.status === "created") await sb.from("viva_payment_sessions").update({ status: "cancelled" }).eq("id", session.id);
      return ok();
    }

    if (!UUID_RE.test(transactionId)) return ok({ ignored: "missing_transaction_id" });

    // Idempotency: a retried "paid" event costs no API calls.
    if (eventTypeId === 1796 && session.status === "paid" && session.viva_transaction_id === transactionId && order.payment_status === "paid") {
      return ok({ duplicate: true });
    }

    const cfg = await loadVivaConfig(sb);
    if (!cfg) return jsonResponse({ error: "Viva credentials unavailable" }, 503); // retry later
    const tx = await retrieveTransaction(cfg, transactionId);
    if (!tx) return jsonResponse({ error: "Viva transaction verification failed" }, 502); // retry later
    if (String(tx.orderCode ?? tx.OrderCode ?? "") !== String(session.viva_order_code)) {
      console.warn("Viva webhook transaction belongs to another payment order", { transactionId });
      return ok({ ignored: "order_code_mismatch" });
    }

    if (eventTypeId === 1796) {
      const expectedCents = toCents(order.total);
      const reason = checkPaidTransaction(tx, session, expectedCents);
      if (reason) {
        console.warn("Viva webhook payment did not pass verification", { reason, transactionId });
        return ok({ ignored: "unverified_payment", reason });
      }
      const result = await settlePayment(sb, order, session, transactionId, tx, "webhook");
      return ok({ result });
    }

    if (eventTypeId === 1797) {
      // A refund is a NEW transaction, different from the original payment.
      if (!session.viva_transaction_id || session.viva_transaction_id === transactionId) return ok({ ignored: "not_a_refund" });
      // Refunds made with viva-refund are already recorded; ones made in the Viva panel are recorded here.
      const { data: known } = await sb.from("payment_refunds").select("id").eq("provider_transaction_id", transactionId).maybeSingle();
      if (known) return ok({ duplicate: true });
      const refundedCents = toCents(tx.amount ?? tx.Amount);
      await sb.from("payment_refunds").insert({ order_id: orderId, amount: refundedCents / 100, provider: "viva", provider_transaction_id: transactionId, note: "Registado pelo webhook da Viva" });
      const { data: all } = await sb.from("payment_refunds").select("amount").eq("order_id", orderId);
      const totalRefundedCents = (all ?? []).reduce((s: number, r: any) => s + toCents(r.amount), 0);
      const full = totalRefundedCents >= toCents(order.total);
      await sb.from("order_status_history").insert({
        order_id: orderId,
        status: full ? "refunded" : "payment_partial_refund",
        notes: `Reembolso de ${(refundedCents / 100).toFixed(2)} € registado pela Viva (transação ${transactionId})${full ? ", encomenda totalmente reembolsada" : ""}.`,
      });
      if (full && order.payment_status === "paid") {
        await sb.from("orders").update({ payment_status: "refunded", status: "refunded", refunded_at: new Date().toISOString() }).eq("id", orderId);
        await sb.from("viva_payment_sessions").update({ status: "refunded" }).eq("id", session.id);
      }
      return ok();
    }

    // 1798: a failed attempt never downgrades an order that was (or later gets) paid; the customer may retry.
    if (session.status !== "paid" && order.payment_status !== "paid") {
      await sb.from("viva_payment_sessions").update({
        status: "failed",
        viva_transaction_id: transactionId,
        failure_reason: firstText(data?.ErrorText, data?.errorText, "Pagamento recusado"),
      }).eq("id", session.id);
      if (order.payment_status === "pending") await sb.from("orders").update({ payment_status: "failed" }).eq("id", orderId);
    }
    return ok();
  } catch (error) {
    console.error("viva-webhook error", error);
    return jsonResponse({ error: "Internal error" }, 500); // Viva will retry
  }
});
