import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAdmin, supabaseAdmin } from "../_shared/admin.ts";
import { loadVivaConfig } from "../_shared/viva.ts";

// Admin-only. Refunds a Viva payment (full or partial) through the Viva API
// (Cancel transaction: DELETE /api/transactions/{id}?amount=<cents>&sourceCode=..., Basic auth with
// Merchant ID + API Key, see developer.viva.com/tutorials/payments/issue-a-refund).
// Body: { orderId: string, amount?: number (euros, default = what is left to refund), note?: string }
const round2 = (v: number) => Math.round(v * 100) / 100;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const guard = await requireAdmin(req);
  if ("error" in guard) return guard.error;

  try {
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.orderId ?? "");
    const note = String(body?.note ?? "").slice(0, 500) || null;

    const { data: order } = await sb.from("orders").select("id,total,status,payment_status,payment_method").eq("id", orderId).maybeSingle();
    if (!order) return jsonResponse({ error: "Encomenda não encontrada." }, 404);
    if (order.payment_status !== "paid") return jsonResponse({ error: "Só é possível reembolsar encomendas pagas." }, 409);

    const { data: session } = await sb.from("viva_payment_sessions").select("viva_transaction_id")
      .eq("order_id", orderId).eq("status", "paid").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const txId = session?.viva_transaction_id;
    if (!txId) return jsonResponse({ error: "Não há pagamento Viva confirmado para esta encomenda." }, 409);

    const { data: previous } = await sb.from("payment_refunds").select("amount").eq("order_id", orderId);
    const refunded = round2((previous ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0));
    const remaining = round2(Number(order.total) - refunded);
    const amount = round2(body?.amount == null ? remaining : Number(body.amount));
    if (!(amount > 0) || amount > remaining + 0.001) {
      return jsonResponse({ error: `Valor inválido. Pode reembolsar até ${remaining.toFixed(2)} €.` }, 400);
    }

    const cfg = await loadVivaConfig(sb);
    const c = cfg?.credentials ?? {};
    if (!cfg || !c.merchant_id || !c.api_key) {
      return jsonResponse({ error: "Preencha o Merchant ID e a API Key da Viva em Integrações (necessários para reembolsos)." }, 503);
    }

    const params = new URLSearchParams({ amount: String(Math.round(amount * 100)) });
    if (c.source_code) params.set("sourceCode", String(c.source_code));
    const res = await fetch(`${cfg.checkoutHost}/api/transactions/${encodeURIComponent(txId)}/?${params}`, {
      method: "DELETE",
      headers: { Authorization: `Basic ${btoa(`${c.merchant_id}:${c.api_key}`)}` },
    });
    const viva: any = await res.json().catch(() => ({}));
    if (!res.ok || viva?.StatusId !== "F") {
      console.error("Viva refund failed", res.status, viva?.ErrorCode, viva?.ErrorText, res.headers.get("x-viva-correlationid"));
      return jsonResponse({ error: viva?.ErrorText ? `A Viva recusou o reembolso: ${viva.ErrorText}` : "A Viva recusou o reembolso." }, 502);
    }

    await sb.from("payment_refunds").insert({
      order_id: orderId, amount, provider: "viva", provider_transaction_id: viva.TransactionId ?? null, note, created_by: guard.userId,
    });
    const full = refunded + amount >= Number(order.total) - 0.009;
    await sb.from("order_status_history").insert({
      order_id: orderId,
      status: full ? "refunded" : "payment_partial_refund",
      notes: `Reembolso ${full ? "total" : "parcial"} de ${amount.toFixed(2)} € feito pela Viva (transação ${viva.TransactionId ?? "?"})${note ? `. Nota: ${note}` : ""}`,
    });
    if (full) {
      // Status change releases stock and coupon (trigger orders_release_resources).
      await sb.from("orders").update({ payment_status: "refunded", status: "refunded", refunded_at: new Date().toISOString(), refund_note: note }).eq("id", orderId);
      await sb.from("viva_payment_sessions").update({ status: "refunded" }).eq("order_id", orderId).eq("status", "paid");
    }
    return jsonResponse({ ok: true, amount, full, remaining: round2(remaining - amount) });
  } catch (error) {
    console.error("viva-refund error", error);
    return jsonResponse({ error: "Não foi possível concluir o reembolso." }, 500);
  }
});
